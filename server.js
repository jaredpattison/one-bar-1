`use strict`;

const express = require('express');
const app = express();
const pg = require('pg');
const superagent = require('superagent');

// Application Middleware
app.use(express.urlencoded({extended:true}));
app.use(express.static('./public'));

// Set the view engine for server-side templating
app.set('view engine', 'ejs');

// Load environment variables from .env file
require('dotenv').config();

app.get('/', function(req, response) {
  response.render('pages/index')
});

app.get('/about', function(req, response) {  
  response.render('pages/about')
});

app.get('/geolocate', function(req, response) {

  response.render('pages/geolocate')
});

// Database setup
const dbClient = new pg.Client(process.env.DATABASE_URL);
dbClient.connect();
dbClient.on('error', err => console.error(err));

const PORT = process.env.PORT;
const accountSid = process.env.TWILIO_SID;
const authToken = process.env.TWILIO_TOKEN;
const smsClient = require('twilio')(accountSid, authToken);

app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));

function handleError(err, res) {
  console.error(err);
  if (res) res.status(500).send('Sorry, something went wrong');
}
function Hospitals(business) {
  this.name = business.name;
  //this.rating = business.rating;
  this.address = business.location.display_address;
  this.phone = business.phone;
}

function Location(query, res) {
  this.latitude = res.body.results[0].geometry.location.lat;
  this.longitude = res.body.results[0].geometry.location.lng;
  this.number = query.number;
}

Location.prototype = {
  save: function() {
    const SQL = `UPDATE user_info SET latitude=$1, longitude=$2 WHERE number=$3;`;
    const values = [ this.latitude, this.longitude, this.number];
    console.log(this)
    dbClient.query(SQL, values);
    return;
  }
}

app.get('/sms', smsHandler);

function smsHandler(request, response) {
  const SQL = 'SELECT * FROM user_info WHERE number=$1;';
  const values = [request.query.From];

  dbClient.query(SQL, values).then(result => {
    if (result.rowCount > 0) {
      console.log('number found')
      console.log('result.rows[0]: ', result.rows[0])
      processText(request, response, result.rows[0]);
    } else {
      console.log('number not found'); 
      //codez for number not found goez herr
    }
  });
}

function processText(request, response, query) {
  const infoRequest = request.query.Body.toLowerCase();

  if (infoRequest.includes('location')) {
    let location = infoRequest.slice(9);
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${location}&key=${process.env.GOOGLE_API_KEY}`;
    superagent.get(url)
      .then(result => {
        const location = new Location(query, result);
        location.save();
        let message = `Hi ${query.name}\nYour location is currently ${location.latitude}, ${location.longitude}`
        sendMessage(request, response, message);
      })
      .catch(error => handleError(error));
  } else {

    // Process text, request APIs, send results via SMS

    if (infoRequest.includes('weather')) {
      const url = `https://api.darksky.net/forecast/${process.env.WEATHER_API_KEY}/${query.latitude},${query.longitude}`;
      superagent.get(url)
        .then(result => {
          const weatherSumm = new Weather(result.body.currently);
          // const weatherSummValues = Object.values(weatherSumm);
          // console.log('weatherSummValues: ', weatherSummValues)
          let message = `Hi ${query.name}\nThe forecast for today is ${weatherSumm.forecast}\nHigh of ${weatherSumm.temperature}\nWind Speed of ${weatherSumm.windSpeed}\nAnd ${weatherSumm.precipProbability}% chance of precipitation`;
          sendMessage(request, response, message);
        })
    }
    //hospitals API-----------currently giving two hospitals (limit=2)//  
    if (infoRequest.includes('hospital')) {
      const url = `https://api.yelp.com/v3/businesses/search?categories=hospitals&limit=2&latitude=${query.latitude}&longitude=${query.longitude}`;
      superagent.get(url)
        .set('Authorization', `Bearer CTyh5NRXQW09RbowjyKn6PEEXfrJHAWOrS08uGIJ2u11ss_Q6QiV4aRnh5kRgePjCqO9aHWOSg-teM6BYCVkNZ44QvV01IEKqFPKEHExqvyn5WXQNRdAWSDhLpr1W3Yx`)
        .then(result => {
          let hospitalSumm = result.body.businesses.map(function (hospitals) {
            return new Hospitals(hospitals);
            
          });
          let message = `Hi ${query.name}\nThe nearest hospital is ${hospitalSumm[0].name}\nLocated at: ${hospitalSumm[0].address}\nPhone ${hospitalSumm[0].phone}\nNext hospital is ${hospitalSumm[1].name}\nLocated at: ${hospitalSumm[1].address}\nPhone ${hospitalSumm[1].phone}`;
          sendMessage(request, response, message);
        })
        .catch(error => handleError(error, response));
    }
    if (infoRequest.includes('help')) {
      let message = `Hi ${query.name},\nAvailable Commands:\nLOCATION [City, State]\nWEATHER\nTRAILS\nLODGING\nGAS\nHOSPITALS`;
      sendMessage(request, response, message);
    }



  }//end of else
}



function sendMessage(request, response, message) {
  console.log('inside sendMessage, message = ', message)
  smsClient.messages
    .create({
      body: message,
      from: process.env.TWILIO_NUMBER,
      to: request.query.From
    })
    .then(message => {
      console.log(message.sid);
      response.send('This message goes to website');
    })
    .done();
}

app.get('*', (request, response) => {
  response.send('Hitting the API');
});

// Weather Model
function Weather(day) {
  this.forecast = day.summary;
  this.temperature = day.temperature;
  this.windSpeed = day.windSpeed;
  this.precipProbability = day.precipProbability;
}

