var RunMode = require('run-mode');
if (!RunMode.isValid()) {
   console.log("FATAL ERROR: Unknown NODE_ENV '" + process.env.NODE_ENV + "'. Must be one of: " + RunMode.getValidModes());
   process.exit(1);
}

if (RunMode.isTest()) {
   process.env['NEW_RELIC_APP_NAME'] = "ESDR Test";
}
var nr = require('newrelic');

var log4js = require('log4js');
log4js.configure('log4js-config-' + RunMode.get() + '.json');
var log = log4js.getLogger('esdr');
log.info("Run Mode: " + RunMode.get());

log.info("New Relic enabled for app: " + ((nr.agent && nr.agent.config && nr.agent.config.app_name) ? nr.agent.config.app_name : "unknown"));

// dependencies
var config = require('./config');
var BodyTrackDatastore = require('bodytrack-datastore');
var express = require('express');
var app = express();
var cors = require('cors');
var expressHandlebars = require('express-handlebars');
var path = require('path');
var favicon = require('serve-favicon');
var compress = require('compression');
var requestLogger = require('morgan');
var bodyParser = require('body-parser');
var passport = require('passport');
var Database = require("./models/Database");
var cookieParser = require('cookie-parser');
var session = require('express-session');
var SessionStore = require('express-mysql-session');
var httpStatus = require('http-status');

// instantiate the datastore
var datastore = new BodyTrackDatastore({
                                          binDir : config.get("datastore:binDirectory"),
                                          dataDir : config.get("datastore:dataDirectory")
                                       });

// decorate express.response with JSend methods
require('jsend-utils').decorateExpressResponse(require('express').response);

var gracefulExit = function() {
   // TODO: any way (or need?) to gracefully shut down the database pool?
   log.info("Shutting down...");
   process.exit(0);
};

// If the Node process ends, then do a graceful shutdown
process
      .on('SIGINT', gracefulExit)
      .on('SIGTERM', gracefulExit);

// start by initializing the database and getting a reference to it
Database.create(function(err, db) {
   if (err) {
      log.error("Failed to initialize the database!" + err);
   }
   else {
      log.info("Database initialized, starting app server...");

      // configure the app
      try {
         // VIEW -------------------------------------------------------------------------------------------------------------

         // setup view engine
         var viewsDir = path.join(__dirname, 'views');
         app.set('views', viewsDir);
         var handlebars = expressHandlebars.create({
                                                      extname : '.hbs',
                                                      defaultLayout : 'main-layout',
                                                      layoutsDir : path.join(viewsDir, "layouts"),
                                                      partialsDir : path.join(viewsDir, "partials"),
                                                      helpers : {
                                                         // Got this from http://stackoverflow.com/a/9405113
                                                         ifEqual : function(v1, v2, options) {
                                                            if (v1 === v2) {
                                                               return options.fn(this);
                                                            }
                                                            return options.inverse(this);
                                                         }
                                                      }
                                                   });

         app.engine('hbs', handlebars.engine);
         app.set('view engine', '.hbs');
         app.set('view cache', RunMode.isStaging() || RunMode.isProduction());           // only cache views in staging and production
         log.info("View cache enabled = " + app.enabled('view cache'));

         // MIDDLEWARE -------------------------------------------------------------------------------------------------

         var oauthServer = require('./middleware/oauth2')(db.users, db.tokens);   // create and configure OAuth2 server
         var error_handlers = require('./middleware/error_handlers');

         app.use(favicon(path.join(__dirname, 'public/favicon.ico')));     // favicon serving
         app.use(compress());                // enables gzip compression
         app.use(express.static(path.join(__dirname, 'public')));          // static file serving

         // enable logging of the user ID, if authenticated
         requestLogger.token('uid', function(req) {
            if (req.user) {
               return req.user.id;
            }
            return '-';
         });

         // set up HTTP request logging (do this AFTER the static file serving so we don't log those)
         if (RunMode.isStaging() || RunMode.isProduction()) {
            // create a write stream (in append mode)
            var fs = require('fs');
            var httpAccessLogDirectory = config.get("httpAccessLogDirectory");
            log.info("HTTP access log: " + httpAccessLogDirectory);
            var accessLogStream = fs.createWriteStream(httpAccessLogDirectory, { flags : 'a' });

            // get the correct remote address from the X-Forwarded-For header
            requestLogger.token('remote-addr', function(req) {
               return req.headers['x-forwarded-for'];
            });

            // This is just the "combined" format with response time and UID appended to the end
            var logFormat = ':remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent" :response-time ms :uid';
            app.use(requestLogger(logFormat, { stream : accessLogStream }));
         }
         else {
            app.use(requestLogger(':method :url :status :response-time ms :res[content-length] :uid'));      // simple request logging when in non-production mode
         }
         app.use(bodyParser.urlencoded({ extended : true }));     // form parsing
         app.use(bodyParser.json({ limit : '25mb' }));            // json body parsing (25 MB limit)
         app.use(function(err, req, res, next) { // function MUST have arity 4 here!
            // catch body parser error (beefed up version of http://stackoverflow.com/a/15819808/703200)
            if (err) {
               var statusCode = err.status || httpStatus.INTERNAL_SERVER_ERROR;
               var message = err.message || (statusCode < httpStatus.INTERNAL_SERVER_ERROR ? "Bad Request" : "Internal Server Error");
               var data = err;

               // Manually set the CORS header here--I couldn't figure out how to get it working with the CORS
               // middleware. We need to do this so that client-side AJAX uploads which try to send files larger than
               // the limit get a proper 413 response.  Without it, the browser will complain that the CORS header is
               // missing.
               res.set('Access-Control-Allow-Origin', '*');

               if (statusCode < httpStatus.INTERNAL_SERVER_ERROR) {
                  res.jsendClientError(message, data, statusCode);
               }
               else {
                  res.jsendServerError(message, data, statusCode);
               }
            }
            else {
               next();
            }
         });

         // configure passport
         var authHelper = require('./middleware/auth')(db.clients, db.users, db.tokens, db.feeds);

         // CUSTOM MIDDLEWARE ------------------------------------------------------------------------------------------

         if (RunMode.isStaging() || RunMode.isProduction()) {
            app.set('trust proxy', 1); // trust first proxy
         }

         // define the various middleware required for routes which need session support
         var sessionSupport = [
            cookieParser(),                  // cookie parsing--MUST come before setting up session middleware!
            session({                        // configure support for storing sessions in the database
                       key : config.get("cookie:name"),
                       secret : config.get("cookie:secret"),
                       store : new SessionStore({
                                                   host : config.get("database:host"),
                                                   port : config.get("database:port"),
                                                   database : config.get("database:database"),
                                                   user : config.get("database:username"),
                                                   password : config.get("database:password")
                                                }),
                       rolling : false,
                       cookie : {
                          httpOnly : true,
                          secure : config.get("cookie:isSecure")   // whether to enable secure cookies (must be true when using HTTPS)
                       },
                       proxy : RunMode.isStaging() || RunMode.isProduction(),       // we use a proxy in staging and production
                       saveUninitialized : true,
                       resave : true,
                       unset : "destroy"
                    }),
            passport.initialize(),           // initialize passport (must come AFTER session middleware)
            passport.session(),              // enable session support for passport
            function(req, res, next) {
               log.debug("req.isAuthenticated()=[" + req.isAuthenticated() + "]");
               res.locals.isAuthenticated = req.isAuthenticated();

               if (req.isAuthenticated()) {
                  res.locals.user = {
                     id : req.user.id
                  };
                  delete req.session.redirectToAfterLogin;
                  delete res.locals.redirectToAfterLogin;
               }
               else {
                  // expose the redirectToAfterLogin page to the view
                  res.locals.redirectToAfterLogin = req.session.redirectToAfterLogin;
               }

               next();
            },
            require('./middleware/accessToken').refreshAccessToken()
         ];

         // define the various middleware required for routes which don't need (and should not have!) session support
         var noSessionSupport = [
            passport.initialize()         // initialize passport
         ];

         // create the FeedRouteHelper
         var FeedRouteHelper = require('./routes/api/feed-route-helper');
         var feedRouteHelper = new FeedRouteHelper(db.feeds);

         // define CORS options and apply CORS to specific route groups
         var corsSupport = cors({
                                   origin : '*'
                                });

         // ensure the user is authenticated before serving up the page
         var ensureAuthenticated = function(req, res, next) {
            if (req.isAuthenticated()) {
               return next();
            }
            // remember where the user was trying to go and then redirect to the login page
            req.session.redirectToAfterLogin = req.originalUrl;
            res.redirect('/login')
         };

         // ROUTING ----------------------------------------------------------------------------------------------------

         app.use('/oauth/*', noSessionSupport, corsSupport);
         app.use('/api/v1/*', noSessionSupport, corsSupport);

         app.use('/oauth', require('./routes/oauth')(oauthServer));
         app.use('/api/v1/time', require('./routes/api/time'));
         app.use('/api/v1/clients', require('./routes/api/clients')(db.clients));
         app.use('/api/v1/users', require('./routes/api/users')(db.users, db.userProperties));
         app.use('/api/v1/products', require('./routes/api/products')(db.products, db.devices));
         app.use('/api/v1/devices', require('./routes/api/devices')(db.devices, db.deviceProperties, db.feeds));
         app.use('/api/v1/feed', require('./routes/api/feed')(db.feeds, feedRouteHelper, authHelper));
         app.use('/api/v1/feeds', require('./routes/api/feeds')(db.feeds, db.feedProperties, feedRouteHelper));
         app.use('/api/v1/multifeeds', require('./routes/api/multifeeds')(db.feeds, db.multifeeds));
         app.use('/api/v1/mirrors', require('./routes/api/mirrors')(db.products, db.mirrorRegistrations));
         app.use('/api/v1/user-verification', require('./routes/api/user-verification')(db.users));
         app.use('/api/v1/password-reset', require('./routes/api/password-reset')(db.users));

         // configure routing
         app.use('/', sessionSupport, require('./routes/index'));
         app.use('/signup', sessionSupport, require('./routes/signup'));
         app.use('/login', sessionSupport, require('./routes/login'));
         app.use('/logout', sessionSupport, require('./routes/logout')(db.tokens));
         app.use('/verification', sessionSupport, require('./routes/verification'));
         app.use('/password-reset', sessionSupport, require('./routes/password-reset'));
         app.use('/access-token', sessionSupport, require('./routes/access-token')(db.tokens));
         app.use('/home', sessionSupport, ensureAuthenticated, require('./routes/home/index'));

         // ERROR HANDLERS ---------------------------------------------------------------------------------------------

         // custom 404
         app.use(error_handlers.http404);

         // dev and prod should handle errors differently: e.g. don't show stacktraces in staging or production
         app.use(RunMode.isStaging() || RunMode.isProduction() ? error_handlers.prod : error_handlers.dev);

         // ------------------------------------------------------------------------------------------------------------

         // set the port and start the server
         app.set('port', config.get("server:port"));
         var server = app.listen(app.get('port'), function() {
            log.info('Express server listening on port ' + server.address().port);
         });

      }
      catch (err) {
         log.error("Sever initialization failed ", err.message);
      }
   }
});
