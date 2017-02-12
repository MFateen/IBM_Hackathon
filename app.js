/**
* Module dependencies.
*/

var express = require('express'),
	routes = require('./routes'),
	user = require('./routes/user'),
	http = require('http'),
	path = require('path'),
	session = require('client-sessions'),
	fs = require('fs');

var app = express();

var db;

var cloudant;


var fileToUpload;

var dbCredentials = {
	dbName: 'my_sample_db'
};

var bodyParser = require('body-parser');
var methodOverride = require('method-override');
var logger = require('morgan');
var errorHandler = require('errorhandler');
var multipart = require('connect-multiparty')
var multipartMiddleware = multipart();
var Cloudant = require('cloudant');

var me = 'e8866ed5-22a3-42c8-9b1a-dacc5aea5704-bluemix'; // Set this to your own account
var password = 'ce30b6047a0a299355c2d6b00e4200f39f11b2165add1568d5ad66415e72dcf9';



// all environments
app.set('port', process.env.PORT || 3000);

app.use(logger('dev'));
app.use(bodyParser.urlencoded({
	extended: true
}));
app.use(bodyParser.json());
app.use(methodOverride());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/style', express.static(path.join(__dirname, '/views/style')));

// development only
if ('development' == app.get('env')) {
	app.use(errorHandler());
}

app.use(session({
	cookieName: 'session',
	secret: 'mod',
	duration: 30 * 60 * 1000,
	activeDuration: 5 * 60 * 1000,
	httpOnly: true,
	secure: true,
	ephemeral: true
}));


function initDBConnection() {
	//When running on Bluemix, this variable will be set to a json object
	//containing all the service credentials of all the bound services
	if (process.env.VCAP_SERVICES) {
		var vcapServices = JSON.parse(process.env.VCAP_SERVICES);
		// Pattern match to find the first instance of a Cloudant service in
		// VCAP_SERVICES. If you know your service key, you can access the
		// service credentials directly by using the vcapServices object.
		for (var vcapService in vcapServices) {
			if (vcapService.match(/cloudant/i)) {
				dbCredentials.url = vcapServices[vcapService][0].credentials.url;
			}
		}
	} else { //When running locally, the VCAP_SERVICES will not be set

		// When running this app locally you can get your Cloudant credentials
		// from Bluemix (VCAP_SERVICES in "cf env" output or the Environment
		// Variables section for an app in the Bluemix console dashboard).
		// Alternately you could point to a local database here instead of a
		// Bluemix service.
		// url will be in this format: https://username:password@xxxxxxxxx-bluemix.cloudant.com
		dbCredentials.url = "REPLACE ME";
	}

	cloudant = require('cloudant')(dbCredentials.url);

	// check if DB exists if not create
	cloudant.db.create(dbCredentials.dbName, function(err, res) {
		if (err) {
			console.log('Could not create new db: ' + dbCredentials.dbName + ', it might already exist.');
		}
	});

	db = cloudant.use(dbCredentials.dbName);
}

initDBConnection();

app.get('/', routes.index);

function createResponseData(id, name, value, attachments) {
	var responseData = {
		id: id,
		name: name,
		value: value,
		attachements: []
	};
	attachments.forEach(function(item, index) {
		var attachmentData = {
			content_type: item.type,
			key: item.key,
			url: '/api/favorites/attach?id=' + id + '&key=' + item.key
		};
		responseData.attachements.push(attachmentData);

	});
	return responseData;
}


var saveDocument = function(id, name, value, response) {

	if (id === undefined) {
		// Generated random id
		id = '';
	}

	db.insert({
		name: name,
		value: value
	}, id, function(err, doc) {
		if (err) {
			console.log(err);
			response.sendStatus(500);
		} else
			response.sendStatus(200);
		response.end();
	});

}

app.get('/api/favorites/attach', function(request, response) {
	var doc = request.query.id;
	var key = request.query.key;

	db.attachment.get(doc, key, function(err, body) {
		if (err) {
			response.status(500);
			response.setHeader('Content-Type', 'text/plain');
			response.write('Error: ' + err);
			response.end();
			return;
		}

		response.status(200);
		response.setHeader("Content-Disposition", 'inline; filename="' + key + '"');
		response.write(body);
		response.end();
		return;
	});
});

app.post('/api/favorites/attach', multipartMiddleware, function(request, response) {

	console.log("Upload File Invoked..");
	console.log('Request: ' + JSON.stringify(request.headers));

	var id;

	db.get(request.query.id, function(err, existingdoc) {

		var isExistingDoc = false;
		if (!existingdoc) {
			id = '-1';
		} else {
			id = existingdoc.id;
			isExistingDoc = true;
		}

		var name = request.query.name;
		var value = request.query.value;

		var file = request.files.file;
		var newPath = './public/uploads/' + file.name;

		var insertAttachment = function(file, id, rev, name, value, response) {

			fs.readFile(file.path, function(err, data) {
				if (!err) {

					if (file) {

						db.attachment.insert(id, file.name, data, file.type, {
							rev: rev
						}, function(err, document) {
							if (!err) {
								console.log('Attachment saved successfully.. ');

								db.get(document.id, function(err, doc) {
									console.log('Attachements from server --> ' + JSON.stringify(doc._attachments));

									var attachements = [];
									var attachData;
									for (var attachment in doc._attachments) {
										if (attachment == value) {
											attachData = {
												"key": attachment,
												"type": file.type
											};
										} else {
											attachData = {
												"key": attachment,
												"type": doc._attachments[attachment]['content_type']
											};
										}
										attachements.push(attachData);
									}
									var responseData = createResponseData(
										id,
										name,
										value,
										attachements);
									console.log('Response after attachment: \n' + JSON.stringify(responseData));
									response.write(JSON.stringify(responseData));
									response.end();
									return;
								});
							} else {
								console.log(err);
							}
						});
					}
				}
			});
		}

		if (!isExistingDoc) {
			existingdoc = {
				name: name,
				value: value,
				create_date: new Date()
			};

			// save doc
			db.insert({
				name: name,
				value: value
			}, '', function(err, doc) {
				if (err) {
					console.log(err);
				} else {

					existingdoc = doc;
					console.log("New doc created ..");
					console.log(existingdoc);
					insertAttachment(file, existingdoc.id, existingdoc.rev, name, value, response);

				}
			});

		} else {
			console.log('Adding attachment to existing doc.');
			console.log(existingdoc);
			insertAttachment(file, existingdoc._id, existingdoc._rev, name, value, response);
		}

	});
});
/////////////////////////////////////////////////////////////////////////////////////////
//var username;
//var userpassword;
//var userdata;

app.post('/logmein', function(request, response) {
	var cloudant2 = Cloudant({
		account: me,
		password: password
	});
	var userdb = cloudant2.db.use("client");
	console.log("Yo estoy Mostafa ");
	userdb.get(request.body.name, function(err, data) {
		// The rest of your code goes here. For example:
		console.log("Found User:", data);
		//    userdata = JSON.parse(data);
		//    username = userdata._id;
		//    userpassword = userdata.passwor
		if ((request.body.name === data._id) && (request.body.password === data.password)) {
			console.log("before session");
			request.session.user = data;
			console.log("after session");
			response.write("success");
			console.log("wowowowowowowowo");
		} else {
			response.write("failed");
			console.log("nononononononbono");
		}
		console.log("Bbkabksbkabskdabksbdksa \n blablablabalbalbla \n" + request.body.name + " " + request.body.password);
		response.end();
	});
});

app.post('/logmein', function(request, response) {
	var cloudant2 = Cloudant({
		account: me,
		password: password
	});
	var userdb = cloudant2.db.use("client");
	console.log("Yo estoy Mostafa ");
	userdb.get(request.body.name, function(err, data) {
		// The rest of your code goes here. For example:
		console.log("Found User:", data);
		//    userdata = JSON.parse(data);
		//    username = userdata._id;
		//    userpassword = userdata.passwor
		if ((request.body.name === data._id) && (request.body.password === data.password)) {
			// sets a cookie with the user's info
			console.log("before session");
			request.session.user = data;
			console.log("after session");

			//redirecting to home.html
			// response.redirect('/home.html');

			response.write("success");
			console.log("wowowowowowowowo");
		} else {
			response.write("failed");
			console.log("nononononononbono");
		}
		console.log("Bbkabksbkabskdabksbdksa \n blablablabalbalbla \n" + request.body.name + " " + request.body.password);
		response.end();
	});
});
// TODO remove hard coded johndoe
var username = "johndoe";
app.post('/addcart', function(request, response) {
	console.log("Updating the cart..");

	var cloudant = Cloudant({
		account: me,
		password: password
	});
	var userdb = cloudant.db.use("client");
	var pharmdb = cloudant.db.use("medicine");

	var pharmacy = request.body.pharmacy;
	var medicine = request.body.medicine;
	var quantity = request.body.quantity;

	console.log(username + " is reserving " + quantity + " " + medicine + " from " + pharmacy);

	pharmdb.get(pharmacy, function(pharmErr, pharmData) {
		if (pharmErr) {
			return console.error("Error in retrieving pharmacy data");
		}

		userdb.get(username, function(userErr, userData) {
			if (userErr) {
				return console.error("Error in retrieving user data");
			}
			userData.cart.push({
				"medicine": medicine,
				"quantity": quantity
			});

			userdb.insert(userData, userData.id, function(err, data) {
				if (err) {
					console.error('Error updating cart');
					return 500;
				}
				return 200;
			});
		});
	});
	response.write("success");
	response.end();
});


app.post('/getcart', function(request, response) {
	console.log("Retreiving the cart..");
	var cloudant = Cloudant({
		account: me,
		password: password
	});
	var userdb = cloudant.db.use("client");
	userdb.get(username, function(userErr, userData) {
		if (userErr) {
			return console.error("Error in retrieving user data");
		}

		response.write(JSON.stringify(userData.cart));
		response.end();
	});
});


app.post('/emptycart', function(request, response) {
	console.log("Emptying the cart..");

	var cloudant = Cloudant({
		account: me,
		password: password
	});
	var userdb = cloudant.db.use("client");

	userdb.get(username, function(userErr, userData) {
		if (userErr) {
			return console.error("Error in retrieving user data");
		}
		userData.cart = [];

		userdb.insert(userData, userData.id, function(err, data) {
			if (err) {
				console.error('Error updating cart');
				return 500;
			}
			return 200;
		});
		
		response.end();
	});
}); 

/* app.post('/search', function(request, response) {
    
    //	var medname = "sth";
	
	console.log("Current User : " + JSON.stringify(request.session.user));

    var cloudant1 = Cloudant({account:me, password:password});
    var db1 = cloudant1.db.use("medicine");
    db1.get(request.pharmacy, function(err, data) {
      if (err) {
        return console.log("Failed to get data: " + err.message);
      }
      // The rest of your code goes here. For example:
      console.log("Found pharmacy data: " + data);
      //var json = JSON.parse(data);
      //var  medName = "panadol";
      var count;
      var pharName = data._id;
      var pharLoc = data.location;
      var pharNum = data.phone;
      var pharEmail = data.email;
      var medName;
      var medPrice;
      var medAmount;
      var medAvailable = "Not Available";
      var jsonstring = "{\"_id\": \""+ pharName +"\" , \"location\": \""+ pharLoc +"\" ,  \"phone\" :  \""+ pharNum +"\" , \"email\" : \""+ pharEmail +"\" , \"name\" : \""+ request.medicine +"\" , \"Price\" : \""+ medPrice +"\" , \"Amount\" : \""+ medAvailable +"\"}";
	  console.log(JSON.stringify(data.medicine));
	  
	  for(count = 0 ; count < data.medicine.length ; count++){
        if(data.medicine[count].name == request.medicine){
          medName = data.medicine[count].name;
          medPrice = data.medicine[count].Price;
          medAmount = data.medicine[count].Amount;
          if(medAmount > 0 ){
            medAvailable = "Available";
          }
          jsonstring = "{\"_id\": \""+ pharName +"\" , \"location\": \""+ pharLoc +"\" ,  \"phone\" :  \""+ pharNum +"\" , \"email\" : \""+ pharEmail +"\" , \"name\" : \""+ request.medicine +"\" , \"Price\" : \""+ medPrice +"\" , \"Amount\" : \""+ medAvailable +"\"}";
          break;
        }
      }
     
     jsonstring = {"name":"mostafa"};
       //jsonReturn = JSON.parse(foundstring);
      console.log('my found name is ' + medName);
      console.log('my found price is ' + medPrice);
      console.log('my found amount is ' + medAmount);
          
          
      console.log('my return json is  ' + jsonstring);
      var jsonReturn = JSON.parse(jsonstring);
          
      response.write(jsonReturn);
      response.end();
      
    });
  });*/



app.post('/api/favorites', function(request, response) {
	console.log("Create Invoked..");
	console.log("Name: " + request.body.name);
	console.log("Value: " + request.body.value);
	// var id = request.body.id;
	var name = request.body.name;
	var value = request.body.value;
	saveDocument(null, name, value, response);
});


app.delete('/api/favorites', function(request, response) {
	console.log("Delete Invoked..");
	var id = request.query.id;
	// var rev = request.query.rev; // Rev can be fetched from request. if
	// needed, send the rev from client
	console.log("Removing document of ID: " + id);
	console.log('Request Query: ' + JSON.stringify(request.query));
	db.get(id, {
		revs_info: true
	}, function(err, doc) {
		if (!err) {
			db.destroy(doc._id, doc._rev, function(err, res) {
				// Handle response
				if (err) {
					console.log(err);
					response.sendStatus(500);
				} else {
					response.sendStatus(200);
				}
			});
		}
	});
});

app.put('/api/favorites', function(request, response) {
	console.log("Update Invoked..");
	var id = request.body.id;
	var name = request.body.name;
	var value = request.body.value;
	console.log("ID: " + id);
	db.get(id, {
		revs_info: true
	}, function(err, doc) {
		if (!err) {
			console.log(doc);
			doc.name = name;
			doc.value = value;
			db.insert(doc, doc.id, function(err, doc) {
				if (err) {
					console.log('Error inserting data\n' + err);
					return 500;
				}
				return 200;
			});
		}
	});
});

app.get('/api/favorites', function(request, response) {
	console.log("Get method invoked.. ")
	db = cloudant.use(dbCredentials.dbName);
	var docList = [];
	var i = 0;
	db.list(function(err, body) {
		if (!err) {
			var len = body.rows.length;
			console.log('total # of docs -> ' + len);
			if (len == 0) {
				// push sample data
				// save doc
				var docName = 'sample_doc';
				var docDesc = 'A sample Document';
				db.insert({
					name: docName,
					value: 'A sample Document'
				}, '', function(err, doc) {
					if (err) {
						console.log(err);
					} else {
						console.log('Document : ' + JSON.stringify(doc));
						var responseData = createResponseData(
							doc.id,
							docName,
							docDesc, []);
						docList.push(responseData);
						response.write(JSON.stringify(docList));
						console.log(JSON.stringify(docList));
						console.log('ending response...');
						response.end();
					}
				});
			} else {
				body.rows.forEach(function(document) {
					db.get(document.id, {
						revs_info: true
					}, function(err, doc) {
						if (!err) {
							if (doc['_attachments']) {
								var attachments = [];
								for (var attribute in doc['_attachments']) {
									if (doc['_attachments'][attribute] && doc['_attachments'][attribute]['content_type']) {
										attachments.push({
											"key": attribute,
											"type": doc['_attachments'][attribute]['content_type']
										});
									}
									console.log(attribute + ": " + JSON.stringify(doc['_attachments'][attribute]));
								}
								var responseData = createResponseData(
									doc._id,
									doc.name,
									doc.value,
									attachments);
							} else {
								var responseData = createResponseData(
									doc._id,
									doc.name,
									doc.value, []);
							}
							docList.push(responseData);
							i++;
							if (i >= len) {
								response.write(JSON.stringify(docList));
								console.log('ending response...');
								response.end();
							}
						} else {
							console.log(err);
						}
					});
				});
			}
		} else {
			console.log(err);
		}
	});
});
http.createServer(app).listen(app.get('port'), '0.0.0.0', function() {
	console.log('Express server listening on port ' + app.get('port'));
});