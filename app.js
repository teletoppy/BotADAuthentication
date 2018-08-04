/*-----------------------------------------------------------------------------
A simple OAuthCard bot for the Microsoft Bot Framework.  (Edited by Top)
-----------------------------------------------------------------------------*/
//read in variable and assign the value

'use strict';
require('dotenv').config(); //to read in the .env variable for authentication purpose
const envx = require("envx");  // read environment

const restify = require('restify');
//const builder = require('./core/'); //alternative can use require('botbuilder');
const builder = require('botbuilder'); //alternative can use require('botbuilder');
const https = require('https');
const request = require('request');

//get the variable here::
//for bot application identity
const MICROSOFT_APP_ID = envx("MICROSOFT_APP_ID"); //get this from app service that BOT is hosted in the setting session
const MICROSOFT_APP_PASSWORD = envx("MICROSOFT_APP_PASSWORD");
//for oauth details
const AZUREAD_APP_ID = envx("AZUREAD_APP_ID"); //get this from oauth connection (that is setup in the BOT menu)
const AZUREAD_APP_PASSWORD = envx("AZUREAD_APP_PASSWORD");
const AZUREAD_APP_REALM = envx("AZUREAD_APP_REALM");  //please read more detail from the tutorial of C#
const AUTHBOT_CALLBACKHOST = envx("AUTHBOT_CALLBACKHOST"); 
const AUTHBOT_STRATEGY = envx("AUTHBOT_STRATEGY");  //you can define v1 and v2 in the variable file separately
const CONNECTION_NAME = envx("CONNECTION_NAME");

// Setup Restify Server
var server = restify.createServer();
server.listen(process.env.port || process.env.PORT || 4000, function () {
   console.log('%s listening to %s', server.name, server.url); 
});
  
// Bot Storage: Here we register the state storage for your bot. 
// Default store: volatile in-memory store - Only for prototyping!
// We provide adapters for Azure Table, CosmosDb, SQL Azure, or you can implement your own!
// For samples and documentation, see: https://github.com/Microsoft/BotBuilder-Azure
var inMemoryStorage = new builder.MemoryBotStorage();

// Create chat connector for communicating with the Bot Framework Service
var connector = new builder.ChatConnector({
    appId: process.env.MICROSOFT_APP_ID,
    appPassword: process.env.MICROSOFT_APP_PASSWORD
});

var connectionName = process.env.CONNECTION_NAME;

// Listen for messages from users 
server.post('/api/messages', connector.listen());

// Create your bot with a function to receive messages from the user
var bot = new builder.UniversalBot(connector, function (session) {
    if (session.message.text == 'signout') {
        // It is important to have a SignOut intent
        connector.signOutUser(session.message.address, connectionName,  (err, result) => {
            if (!err) {
                session.send('You are signed out.');
            } else {
                session.send('There was a problem signing you out.');                
            }
        });
    } else {
        // First check whether the Azure Bot Service already has a token for this user
        connector.getUserToken(session.message.address, connectionName, undefined, (err, result) => {
            if (result) {
                // If there is already a token, the bot can use it directly
                session.send('You are already signed in with token: ' + result.token);
            } else {
                // If there not is already a token, the bot can send an OAuthCard to have the user log in
                if (!session.userData.activeSignIn) {
                    session.send("Hello! Let's get you signed in!");
                    builder.OAuthCard.create(connector, session, connectionName, "Please sign in", "Sign in", (createSignInErr, signInMessage) =>
                    {
                        if (signInMessage) {
                            session.send(signInMessage);
                            session.userData.activeSignIn = true;
                        } else {
                            session.send("Something went wrong trying to sign you in.");
                        }     
                    });
                } else {
                    // Some clients require a 6 digit code validation so we can check that here
                    session.send("Let's see if that code works...");
                    connector.getUserToken(session.message.address, connectionName, session.message.text, (err2, tokenResponse) => {
                        if (tokenResponse) {
                            session.send('It worked! You are now signed in with token: ' + tokenResponse.token);
                            session.userData.activeSignIn = false;
                        } else {
                            session.send("Hmm, that code wasn't right");
                        }
                    });
                }
            }
        });
    }
})
.set('storage', inMemoryStorage) // Register in memory storage
.on("event", (event) => {         // Handle 'event' activities
    if (event.name == 'tokens/response') {
        // received a TokenResponse, which is how the Azure Bot Service responds with the user token after an OAuthCard
        bot.loadSession(event.address, (err, session) => {
            let tokenResponse = event.value;
            session.send('You are now signed in with token: ' + tokenResponse.token);
            session.userData.activeSignIn = false;
        });
    }
});

connector.onInvoke((event, cb) => {
    if (event.name == 'signin/verifyState') {
        // received a MS Team's code verification Invoke Activity
        bot.loadSession(event.address, (err, session) => {
            let verificationCode = event.value.state;
            // Get the user token using the verification code sent by MS Teams
            connector.getUserToken(session.message.address, connectionName, verificationCode, (err, result) => {
                session.send('You are now signed in with token: ' + result.token);
                session.userData.activeSignIn = false;
                cb(undefined, {}, 200);
            });
        });
    } else {
        cb(undefined, {}, 200);
    }
});