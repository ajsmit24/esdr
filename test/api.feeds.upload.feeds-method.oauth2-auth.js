var should = require('should');
var flow = require('nimble');
var httpStatus = require('http-status');
var superagent = require('superagent-ls');
var requireNew = require('require-new');
var wipe = require('./fixture-helpers/wipe');
var setup = require('./fixture-helpers/setup');
var executeUploadTest = require('./fixture-helpers/test-utils').executeUploadTest;
var createAuthorizationHeader = require('./fixture-helpers/test-utils').createAuthorizationHeader;

var config = require('../config');

var ESDR_API_ROOT_URL = config.get("esdr:apiRootUrl");
var ESDR_FEEDS_API_URL = ESDR_API_ROOT_URL + "/feeds";

describe("REST API", function() {
   var user1 = requireNew('./fixtures/user1.json');
   var user2 = requireNew('./fixtures/user2.json');
   var product1 = requireNew('./fixtures/product1.json');
   var device1 = requireNew('./fixtures/device1.json');
   var feed1 = requireNew('./fixtures/feed1.json');   // public,  user 1, product 1, device 1
   var feed2 = requireNew('./fixtures/feed2.json');   // private, user 1, product 1, device 1

   var feedUpload1 = {
      request : requireNew('./fixtures/feed-upload1-request.json'),
      response : requireNew('./fixtures/feed-upload1-response.json')
   };

   var feedUpload2 = {
      request : requireNew('./fixtures/feed-upload2-request.json'),
      response : requireNew('./fixtures/feed-upload2-response.json')
   };

   var feedUpload3 = {
      request : requireNew('./fixtures/feed-upload3-request.json'),
      response : requireNew('./fixtures/feed-upload3-response.json')
   };

   var feedUpload4 = {
      request : requireNew('./fixtures/feed-upload4-request.json'),
      response : requireNew('./fixtures/feed-upload4-response.json')
   };

   var feedUpload5 = {
      request : requireNew('./fixtures/feed-upload5-request.json'),
      response : requireNew('./fixtures/feed-upload5-response.json')
   };

   var feedUpload6 = {
      request : requireNew('./fixtures/feed-upload6-request.json'),
      response : requireNew('./fixtures/feed-upload6-response.json')
   };

   var feedUpload7 = {
      request : requireNew('./fixtures/feed-upload7-request.json'),
      response : requireNew('./fixtures/feed-upload7-response.json')
   };

   var feedUpload8 = {
      request : requireNew('./fixtures/feed-upload8-request.json'),
      response : requireNew('./fixtures/feed-upload8-response.json')
   };

   before(function(initDone) {
      flow.series(
            [
               wipe.wipeAllData,
               function(done) {
                  setup.createUser(user1, done);
               },
               function(done) {
                  setup.verifyUser(user1, done);
               },
               function(done) {
                  setup.authenticateUser(user1, done);
               },
               function(done) {
                  setup.createUser(user2, done);
               },
               function(done) {
                  setup.verifyUser(user2, done);
               },
               function(done) {
                  setup.authenticateUser(user2, done);
               },
               function(done) {
                  product1.creatorUserId = user1.id;
                  setup.createProduct(product1, done);
               },
               function(done) {
                  device1.userId = user1.id;
                  device1.productId = product1.id;
                  setup.createDevice(device1, done);
               },
               function(done) {
                  feed1.userId = user1.id;
                  feed1.deviceId = device1.id;
                  feed1.productId = product1.id;
                  feed1.channelSpecs = product1.defaultChannelSpecs;
                  setup.createFeed(feed1, done);
               },
               function(done) {
                  feed2.userId = user1.id;
                  feed2.deviceId = device1.id;
                  feed2.productId = product1.id;
                  feed2.channelSpecs = product1.defaultChannelSpecs;
                  setup.createFeed(feed2, done);
               }
            ],
            initDone
      );
   });

   describe("Feeds", function() {
      describe("Upload", function() {
         describe("To /feeds method", function() {

            it("Should fail to upload to a feed if no authentication is provided", function(done) {
               superagent
                     .put(ESDR_FEEDS_API_URL + "/" + feed1.id)
                     .send({})
                     .end(function(err, res) {
                        if (err) {
                           return done(err);
                        }

                        res.should.have.property('status', httpStatus.UNAUTHORIZED);
                        res.should.have.property('body');
                        res.body.should.have.properties({
                                                           code : httpStatus.UNAUTHORIZED,
                                                           status : 'error'
                                                        });
                        res.body.should.have.property('data', null);

                        done();
                     });
            });

            describe("OAuth2 authentication", function() {

               [
                  {
                     description : "Should be able to upload empty data to a public feed using the user's OAuth2 access token to authenticate",
                     url : function() {
                        return ESDR_FEEDS_API_URL + "/" + feed1.id;
                     },
                     headers : function() {
                        return createAuthorizationHeader(user1.accessToken);
                     },
                     dataToUpload : {},
                     expectedHttpStatus : httpStatus.OK,
                     expectedStatusText : 'success',
                     expectedResponseData : {
                        channelBounds : {},
                        importedBounds : {}
                     }
                  },
                  {
                     description : "Should be able to upload empty data to a private feed using the user's OAuth2 access token to authenticate",
                     url : function() {
                        return ESDR_FEEDS_API_URL + "/" + feed2.id;
                     },
                     headers : function() {
                        return createAuthorizationHeader(user1.accessToken);
                     },
                     dataToUpload : {},
                     expectedHttpStatus : httpStatus.OK,
                     expectedStatusText : 'success',
                     expectedResponseData : {
                        channelBounds : {},
                        importedBounds : {}
                     }
                  },
                  {
                     description : "Should be able to upload to a public feed using the user's OAuth2 access token to authenticate",
                     url : function() {
                        return ESDR_FEEDS_API_URL + "/" + feed1.id;
                     },
                     headers : function() {
                        return createAuthorizationHeader(user1.accessToken);
                     },
                     dataToUpload : feedUpload1.request,
                     expectedHttpStatus : httpStatus.OK,
                     expectedStatusText : 'success',
                     expectedResponseData : feedUpload1.response.data
                  },
                  {
                     description : "Should be able to upload to a private feed using the user's OAuth2 access token to authenticate",
                     url : function() {
                        return ESDR_FEEDS_API_URL + "/" + feed2.id;
                     },
                     headers : function() {
                        return createAuthorizationHeader(user1.accessToken);
                     },
                     dataToUpload : feedUpload5.request,
                     expectedHttpStatus : httpStatus.OK,
                     expectedStatusText : 'success',
                     expectedResponseData : feedUpload5.response.data
                  },
                  {
                     description : "Should be able to upload more data to a public feed using the user's OAuth2 access token to authenticate",
                     url : function() {
                        return ESDR_FEEDS_API_URL + "/" + feed1.id;
                     },
                     headers : function() {
                        return createAuthorizationHeader(user1.accessToken);
                     },
                     dataToUpload : feedUpload2.request,
                     expectedHttpStatus : httpStatus.OK,
                     expectedStatusText : 'success',
                     expectedResponseData : feedUpload2.response.data
                  },
                  {
                     description : "Should be able to upload more data to a private feed using the user's OAuth2 access token to authenticate",
                     url : function() {
                        return ESDR_FEEDS_API_URL + "/" + feed2.id;
                     },
                     headers : function() {
                        return createAuthorizationHeader(user1.accessToken);
                     },
                     dataToUpload : feedUpload6.request,
                     expectedHttpStatus : httpStatus.OK,
                     expectedStatusText : 'success',
                     expectedResponseData : feedUpload6.response.data
                  },
                  {
                     description : "Should be able to upload data for a single channel to a public feed (this one will affect the min/max times)",
                     url : function() {
                        return ESDR_FEEDS_API_URL + "/" + feed1.id;
                     },
                     headers : function() {
                        return createAuthorizationHeader(user1.accessToken);
                     },
                     dataToUpload : feedUpload3.request,
                     expectedHttpStatus : httpStatus.OK,
                     expectedStatusText : 'success',
                     expectedResponseData : feedUpload3.response.data
                  },
                  {
                     description : "Should be able to upload data for a single channel to a private feed (this one will affect the min/max times)",
                     url : function() {
                        return ESDR_FEEDS_API_URL + "/" + feed2.id;
                     },
                     headers : function() {
                        return createAuthorizationHeader(user1.accessToken);
                     },
                     dataToUpload : feedUpload7.request,
                     expectedHttpStatus : httpStatus.OK,
                     expectedStatusText : 'success',
                     expectedResponseData : feedUpload7.response.data
                  },
                  {
                     description : "Should be able to upload data for a single channel to a public feed (this one won't affect the min/max times)",
                     url : function() {
                        return ESDR_FEEDS_API_URL + "/" + feed1.id;
                     },
                     headers : function() {
                        return createAuthorizationHeader(user1.accessToken);
                     },
                     dataToUpload : feedUpload4.request,
                     expectedHttpStatus : httpStatus.OK,
                     expectedStatusText : 'success',
                     expectedResponseData : feedUpload4.response.data
                  },
                  {
                     description : "Should be able to upload data for a single channel to a private feed (this one won't affect the min/max times)",
                     url : function() {
                        return ESDR_FEEDS_API_URL + "/" + feed2.id;
                     },
                     headers : function() {
                        return createAuthorizationHeader(user1.accessToken);
                     },
                     dataToUpload : feedUpload8.request,
                     expectedHttpStatus : httpStatus.OK,
                     expectedStatusText : 'success',
                     expectedResponseData : feedUpload8.response.data
                  },
                  {
                     description : "Should fail to upload to a public feed using the wrong user's OAuth2 access token to authenticate",
                     url : function() {
                        return ESDR_FEEDS_API_URL + "/" + feed1.id;
                     },
                     headers : function() {
                        return createAuthorizationHeader(user2.accessToken);
                     },
                     dataToUpload : {},
                     expectedHttpStatus : httpStatus.FORBIDDEN,
                     expectedStatusText : 'error',
                     expectedResponseData : null
                  },
                  {
                     description : "Should fail to upload to a private feed using the wrong user's OAuth2 access token to authenticate",
                     url : function() {
                        return ESDR_FEEDS_API_URL + "/" + feed2.id;
                     },
                     headers : function() {
                        return createAuthorizationHeader(user2.accessToken);
                     },
                     dataToUpload : {},
                     expectedHttpStatus : httpStatus.FORBIDDEN,
                     expectedStatusText : 'error',
                     expectedResponseData : null
                  },
                  {
                     description : "Should fail to upload to a feed using a valid OAuth2 access token but an invalid feed ID",
                     url : function() {
                        return ESDR_FEEDS_API_URL + "/" + 0;
                     },
                     headers : function() {
                        return createAuthorizationHeader(user1.accessToken);
                     },
                     dataToUpload : {},
                     expectedHttpStatus : httpStatus.NOT_FOUND,
                     expectedStatusText : 'error',
                     expectedResponseData : null
                  },
                  {
                     description : "Should fail to upload to a public feed using an invalid OAuth2 access token to authenticate",
                     url : function() {
                        return ESDR_FEEDS_API_URL + "/" + feed1.id;
                     },
                     headers : function() {
                        return createAuthorizationHeader("bogus");
                     },
                     dataToUpload : {},
                     expectedHttpStatus : httpStatus.FORBIDDEN,
                     expectedStatusText : 'error',
                     expectedResponseData : null
                  },
                  {
                     description : "Should fail to upload to a private feed using an invalid OAuth2 access token to authenticate",
                     url : function() {
                        return ESDR_FEEDS_API_URL + "/" + feed2.id;
                     },
                     headers : function() {
                        return createAuthorizationHeader("bogus");
                     },
                     dataToUpload : {},
                     expectedHttpStatus : httpStatus.FORBIDDEN,
                     expectedStatusText : 'error',
                     expectedResponseData : null
                  },
                  {
                     description : "Should fail to upload to a public feed using no authentication",
                     url : function() {
                        return ESDR_FEEDS_API_URL + "/" + feed1.id;
                     },
                     headers : {},
                     dataToUpload : {},
                     expectedHttpStatus : httpStatus.UNAUTHORIZED,
                     expectedStatusText : 'error',
                     expectedResponseData : null
                  },
                  {
                     description : "Should fail to upload to a private feed using no authentication",
                     url : function() {
                        return ESDR_FEEDS_API_URL + "/" + feed2.id;
                     },
                     headers : {},
                     dataToUpload : {},
                     expectedHttpStatus : httpStatus.UNAUTHORIZED,
                     expectedStatusText : 'error',
                     expectedResponseData : null
                  }
               ].forEach(executeUploadTest);

            });   // End OAuth2 authentication

         });   // End To /feeds method
      });   // End Upload
   });   // End Feeds
});   // End REST API