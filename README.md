![Cryb OSS](.github/api-icon.png "@cryb/api Logo")

_**API** - Core services_

![GitHub contributors](https://img.shields.io/github/contributors/crybapp/api) ![GitHub](https://img.shields.io/github/license/crybapp/api) [![PayPal Donate](https://img.shields.io/badge/donate-PayPal-blue.svg)](https://paypal.me/williamsthing)

## Docs
* [Info](#info)
    * [Status](#status)
* [Codebase](#codebase)
    * [Folder Structure](#folder-structure)
    * [First time setup](#first-time-setup)
        * [Installation](#installation)
    * [Running the app locally](#running-the-app-locally)
        * [Background services](#background-services)
        * [Starting @cryb/api](#starting-@cryb/api)
* [Questions / Issues](#questions-/-issues)

## Info
`@cryb/api` is the core service used to handle requests from clients over REST and WebSocket.

Events such as Room creation, user authentication and requests to `@cryb/portals` to create VM instances are sent from `@cryb/api`.

### Status
`@cryb/api` has been actively developed internally since August 2019, and is now open source as of October 2019.

## Codebase
The codebase for `@cryb/api` is written in JavaScript, utilising TypeScript and Node.js. Express.js is used for our REST API, while the WebSocket API uses the `ws` module.

MongoDB is used as the primary database, while Redis is used for cache and PUB/SUB.

### Folder Structure
```
cryb/api/
└──┐ src # The core source code
   ├── config # Config files for Redis, Passport, etc
   ├── controllers # Our REST route controller files
   ├── drivers # Methods used to talk to other microservices, such as @cryb/portals
   ├── models # Models for our a data types, such as users and rooms
   ├── schemas # Mongoose schema files
   ├── server # Our Express.js setup
   ├── services # Abstractions for Oauth2, etc
   └── utils # Helper methods
```

### First time setup
First, clone the `@cryb/api` repository locally:

```
git clone https://github.com/crybapp/api.git
```

#### Installation
The following services need to be installed for `@cryb/api` to function:

* MongoDB
* Redis

We recommend that you run the following services alongside `@cryb/api`, but it's not required.
* `@cryb/portals`
* `@cryb/aperture`

You also need to install the required dependencies, by running either:

```
npm install
```
or
```
yarn
```

Ensure that `.env-example` is either copied and renamed to `.env`, or is simply renamed to `.env`.

In this file, you'll need to supply the environment the app is running in under `NODE_ENV`, the key used to decrypt incoming requests over HTTP and WS, and the URI for MongoDB.

### Running the app locally

#### Background Services
Make sure that you have installed MongoDB and Redis, and they are both running locally on port 27017 and 6379 respectively.

The command to start MongoDB is `mongod`, and the command to start Redis is `redis-server`.

If you're developing a feature that requires the VM infrastructure, then make sure `@cryb/portals` and `@cryb/aperture` are running.

#### Starting @cryb/api
To run `@cryb/api` in development mode, run either:

```
npm run dev
```
or
```
yarn dev
```

## Questions / Issues

If you have an issues with `@cryb/api`, please either open a GitHub issue, or contact a maintainer.