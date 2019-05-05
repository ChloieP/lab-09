'use strict';

//--------------------------------
// Load Enviroment Variables from the .env file
//--------------------------------
require('dotenv').config();

//--------------------------------
// Require libraries
//--------------------------------
const express = require('express');
const cors = require('cors');
const superagent = require('superagent');
const pg = require('pg');

//--------------------------------
//Application setup
//--------------------------------
const PORT = process.env.PORT;
const app = express();
app.use(cors());

//--------------------------------
// Database Config
//--------------------------------
const client = new pg.Client(process.env.DATABASE_URL);

client.connect();

client.on('err', err => console.error(err));

//--------------------------------
// Lookup Function
//--------------------------------
let lookup = (handler) => {
  let SQL = `SELECT * FROM ${handler.tableName} WHERE location_id=$1;`;

  return client.query(SQL, [handler.location_id])
    .then(results => {
      if (results.rowCount > 0) {
        handler.cacheHit(results);
      } else {
        handler.cacheMiss();
      }
    })
    .catch(() => errorMessage());
};

//--------------------------------
// Delete Function
//--------------------------------
let deleteByLocationId = (table, location_id) => {
  const SQL = `DELETE FROM ${table} WHERE location_id=${location_id};`;
  return client.query(SQL);
};

//--------------------------------
// Constructors Functions
//--------------------------------
function Location(query, geoData) {
  this.search_query = query;
  this.formatted_query = geoData.formatted_address;
  this.latitude = geoData.geometry.location.lat;
  this.longitude = geoData.geometry.location.lng;
}

function Weather(day) {
  this.forecast = day.summary;
  this.time = new Date(day.time * 1000).toDateString();
  this.created_at = Date.now();
}

Weather.tableName = 'weathers';
Weather.lookup = lookup;
Weather.deleteByLocationId = deleteByLocationId;

function Events(data) {
  let time = Date.parse(data.start.local);
  let newDate = new Date(time).toDateString();
  this.link = data.url;
  this.name = data.name.text;
  this.event_date = newDate;
  this.summary = data.summary;
  this.created_at = Date.now();
}

Events.tableName = 'events';
Events.lookup = lookup;
Events.deleteByLocationId = deleteByLocationId;

function Movies(data) {
  this.title = data.title;
  this.overview = data.overview;
  this.image_url = `https://image.tmdb.org/t/p/original${data.poster_path}`;
  this.released_on = data.release_date;
  this.total_votes = data.vote_count;
  this.average_votes = data.vote_average;
  this.popularity = data.popularity;
  this.created_at = Date.now();
}

Movies.tableName = 'movies';
Movies.lookup = lookup;
Movies.deleteByLocationId = deleteByLocationId;

function Yelp(data) {
  this.name = data.name;
  this.rating = data.rating;
  this.price = data.price;
  this.url = data.url;
  this.image_url = data.image_url;
  this.created_at = Date.now();
}

Yelp.tableName = 'yelps';
Yelp.lookup = lookup;
Yelp.deleteByLocationId = deleteByLocationId;

//--------------------------------
// Timeouts
//--------------------------------
const timeout = {
  weather: 15 * 1000, // Weather updates after 15 seconds as to help with grading
  events: 86400 * 1000, // Events updates after 24 hours due to events possibly changing or getting added within that timeframe
  movies: 25920 * 1000, // Movies get added every week so i've chosen to update this every few days
  yelp: 2629743 * 1000 // Yelp updates after 1 month because average rating and prices aren't going to change frequently
};

//--------------------------------
// Database and API Query for Locations
//--------------------------------
Location.lookup = handler => {
  const SQL = `SELECT * FROM locations WHERE search_query=$1;`;
  const values = [handler.query];

  return client.query(SQL, values)
    .then(results => {
      if (results.rowCount > 0) {
        handler.cacheHit(results);
      } else {
        handler.cacheMiss(results);
      }
    })
    .catch(() => errorMessage());
};

Location.fetchLocation = (data) => {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${data}&key=${process.env.GEOCODE_API_KEY}`;

  return superagent.get(url)
    .then(result => {
      if (!result.body.results.length) throw 'no data';
      let location = new Location(data, result.body.results[0]);
      return location.save()
        .then(result => {
          location.id = result.rows[0].id;
          return location;
        });

    })
    .catch(() => errorMessage());
};

Location.prototype.save = function() {
  let SQL = `INSERT INTO locations 
    (search_query, formatted_query, latitude, longitude)
    VALUES ($1, $2, $3, $4)
    RETURNING id;`;

  let values = Object.values(this);
  return client.query(SQL, values);
};

//--------------------------------
// Database and API Query for Weather
//--------------------------------
Weather.fetch = (query) => {
  const url = `https://api.darksky.net/forecast/${process.env.WEATHER_API_KEY}/${query.latitude},${query.longitude}`;

  return superagent.get(url)
    .then(result => {
      let weatherData = result.body.daily.data.map(day => {
        let weather = new Weather(day);
        weather.save(query.id);
        return weather;
      });
      return weatherData;
    })
    .catch(() => errorMessage());
};

Weather.prototype.save = function(location_id) {
  let SQL = `INSERT INTO weathers 
    (forecast, time, created_at, location_id)
    VALUES ($1, $2, $3, $4);`;

  let values = Object.values(this);
  values.push(location_id);

  return client.query(SQL, values);
};

//--------------------------------
// Database and API Query for Event
//--------------------------------
Events.fetch = (query) => {
  let url = `https://www.eventbriteapi.com/v3/events/search?token=${process.env.EVENTBRITE_API_KEY}&location.address=${query.formatted_query}`;

  return superagent.get(url)
    .then(result => {
      const eventData = result.body.events.map(item => {
        let event = new Events(item);
        event.save(query.id);
        return event;
      });

      return eventData;
    })
    .catch(() => errorMessage());
};

Events.prototype.save = function(location_id) {
  let SQL = `INSERT INTO events 
    (link, name, event_date, summary, created_at, location_id)
    VALUES ($1, $2, $3, $4, $5, $6);`;

  let values = Object.values(this);
  values.push(location_id);

  return client.query(SQL, values);
};

//--------------------------------
// Database and API Query for Movies
//--------------------------------
Movies.fetch = (query) => {
  let url = `https://api.themoviedb.org/3/movie/now_playing?api_key=${process.env.MOVIE_API_KEY}&language=en-US&page=1`;

  return superagent.get(url)
    .then(result => {
      const movieData = result.body.results.map(item => {
        let movie = new Movies(item);
        movie.save(query.id);
        return movie;
      });

      return movieData;
    })
    .catch(() => errorMessage());
};

Movies.prototype.save = function(location_id) {
  let SQL = `INSERT INTO movies
    (title, overview, image_url, released_on, total_votes, average_votes, popularity, created_at, location_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);`;

  const values = Object.values(this);
  values.push(location_id);

  return client.query(SQL, values);
};

//--------------------------------
// Database and API Query for Yelp
//--------------------------------
Yelp.fetch = (query) => {
  let url = `https://api.yelp.com/v3/businesses/search?latitude=${query.latitude}&longitude=${query.longitude}`;

  return superagent.get(url) 
    .set('Authorization', `Bearer ${process.env.YELP_API_KEY}`)
    .then(result => {
      const yelpData = result.body.businesses.map(item => {
        let yelp = new Yelp(item);
        yelp.save(query.id);
        return yelp;
      });

      return yelpData;
    })
    .catch(() => errorMessage());
};

Yelp.prototype.save = function(location_id) {
  let SQL = `INSERT INTO yelps
    (name, rating, price, url, image_url, created_at, location_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7);`;

  const values = Object.values(this);
  values.push(location_id);

  return client.query(SQL, values);
};

//--------------------------------
// Route Callbacks
//--------------------------------
let getLocation = (request, response) => {
  const locationHandler = {
    query: request.query.data,
    cacheHit: result => {
      response.send(result.rows[0]);
    },
    cacheMiss: () => {
      Location.fetchLocation(request.query.data)
        .then(result => response.send(result));
    }
  };

  Location.lookup(locationHandler);
};

let getWeather = (request, response) => { 
  const weatherHandler = {
    location_id: request.query.data.id,
    tableName: Weather.tableName,
    cacheHit: (result) => {
      let ageOfResult = (Date.now() - result.rows[0].created_at);
      if (ageOfResult > timeout.weather) {
        Weather.deleteByLocationId(Weather.tableName, result.rows[0].location_id);
        this.cacheMiss();
      } else {
        response.send(result.rows);
      }
    },
    cacheMiss: () => {
      Weather.fetch(request.query.data)
        .then((results) => response.send(results))
        .catch(() => errorMessage());
    }
  };

  Weather.lookup(weatherHandler);
};

let getEvents = (request, response) => {
  const eventHandler = {
    location_id: request.query.data.id,
    tableName: Events.tableName,
    cacheHit: (result) => {
      response.send(result.rows);
      let ageOfResult = (Date.now() - result.rows[0].created_at);
      if (ageOfResult > timeout.events) {
        Events.deleteByLocationId(Events.tableName, result.rows[0].location_id);
        this.cacheMiss();
      } else {
        response.send(result.rows);
      }
    },
    cacheMiss: () => {
      Events.fetch(request.query.data)
        .then(results => response.send(results))
        .catch(() => errorMessage());
    }
  };

  Events.lookup(eventHandler);
};

let getMovies = (request, response) => {
  const moviesHandler = {
    location_id: request.query.data.id,
    tableName: Movies.tableName,
    cacheHit: (result) => {
      response.send(result.rows);
      let ageOfResult = (Date.now() - result.rows[0].created_at);
      if (ageOfResult > timeout.movies) {
        Movies.deleteByLocationId(Movies.tableName, result.rows[0].location_id);
        this.cacheMiss();
      } else {
        response.send(result.rows);
      }
    },
    cacheMiss: () => {
      Movies.fetch(request.query.data)
        .then(results => response.send(results))
        .catch(() => errorMessage());
    }
  };

  Movies.lookup(moviesHandler);
};

let getYelp = (request, response) => {
  const yelpHandler = {
    location_id: request.query.data.id,
    tableName: Yelp.tableName,
    cacheHit: (result) => {
      response.send(result.rows);
      let ageOfResult = (Date.now() - result.rows[0].created_at);
      if (ageOfResult > timeout.yelp) {
        Yelp.deleteByLocationId(Yelp.tableName, result.rows[0].location_id);
        this.cacheMiss();
      } else {
        response.send(result.rows);
      }
    },
    cacheMiss: () => {
      Yelp.fetch(request.query.data)
        .then(results => response.send(results))
        .catch(() => errorMessage());
    }
  };

  Yelp.lookup(yelpHandler);
};

//--------------------------------
// Routes
//--------------------------------
app.get('/location', getLocation);
app.get('/weather', getWeather);
app.get('/events', getEvents);
app.get('/movies', getMovies);
app.get('/yelp', getYelp);

//--------------------------------
// Error Message
//--------------------------------
let errorMessage = () => {
  let errorObj = {
    status: 500,
    responseText: 'Sorry something went wrong',
  };
  return errorObj;
};

//--------------------------------
// Power On
//--------------------------------
app.listen(PORT, () => console.log(`app is listening ${PORT}`));
