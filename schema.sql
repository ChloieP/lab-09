DROP TABLE IF EXISTS weathers;
DROP TABLE IF EXISTS events;
DROP TABLE IF EXISTS movies;
DROP TABLE IF EXISTS yelps;
DROP TABLE IF EXISTS locations;

CREATE TABLE locations (
  id SERIAL PRIMARY KEY,
  search_query VARCHAR(100),
  formatted_query VARCHAR(100),
  latitude NUMERIC(10, 7),
  longitude NUMERIC(10, 7)
);

CREATE TABLE weathers (
  id SERIAL PRIMARY KEY,
  forecast VARCHAR(500),
  time VARCHAR(100),
  created_at BIGINT,
  location_id INTEGER NOT NULL,
  FOREIGN KEY (location_id) REFERENCES locations (id)
);

CREATE TABLE events (
  id SERIAL PRIMARY KEY,
  link VARCHAR(500),
  name VARCHAR(500),
  event_date VARCHAR(500),
  summary VARCHAR(500),
  created_at BIGINT,
  location_id INTEGER NOT NULL,
  FOREIGN KEY (location_id) REFERENCES locations (id)
);

CREATE TABLE movies (
  id SERIAL PRIMARY KEY,
  title VARCHAR(500),
  overview TEXT,
  image_url TEXT,
  released_on VARCHAR(500),
  total_votes VARCHAR(500),
  average_votes VARCHAR(500),
  popularity VARCHAR(500),
  created_at BIGINT,
  location_id INTEGER NOT NULL,
  FOREIGN KEY (location_id) REFERENCES locations (id)
);

CREATE TABLE yelps (
  id SERIAL PRIMARY KEY,
  name VARCHAR(500),
  rating VARCHAR(500),
  price VARCHAR(500),
  url VARCHAR(500),
  image_url VARCHAR(500),
  created_at BIGINT,
  location_id INTEGER NOT NULL,
  FOREIGN KEY (location_id) REFERENCES locations (id)
);
