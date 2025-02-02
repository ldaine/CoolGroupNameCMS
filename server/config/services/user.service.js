var authService = require('./auth.service');
var User = require('../../models/user');
var passport = require('passport');
var nodemailer = require('nodemailer');
var async = require('async');
var crypto = require('crypto');


module.exports.createUser = function createUser(userModel, callback) {

    var salt = authService.createSalt();
    var hash = authService.hashPwd(salt, userModel.password);

    //creating user object, based on which mongo User can be created
    var user = {
        firstName: userModel.firstName,
        lastName:  userModel.lastName,
        username: userModel.username,
        salt: salt,
        hashed_pwd: hash,
        roles: userModel.roles || ['commentator']
    };

    //creating passing object to mongoose schema
    var newUser = new User(user);

    //saving user to database
    newUser.save(function(err, user){
        if(err) {
            callback({success: false, message: "Error"});
        } else {
            callback({success: true, message: "Success", data: user});
        }
    });
};

module.exports.updateUser = function updateUser(userId, userModel, callback) {

    User.findById(userId, function(err, user){
        if(err) {callback({success: false, message: "Error"});}

        var salt = authService.createSalt();
        var hash = authService.hashPwd(salt, userModel.password);

        user.username = userModel.username;
        user.firstName = userModel.firstName;
        user.lastName = userModel.lastName;
        user.roles = userModel.roles;
        user.hashed_pwd = hash;
        user.salt = salt;

        user.save(function(err){
            if(err) {
                callback({success: false, message: "Error"});
            } else {
                callback({success: true, message: "Success"});
            }
        });
    });
};

module.exports.findUserByUsername = function findUserByUsername(username) {

    var user = User.findOne({username: username});

    return {_id: user._id,
        username: username};
};

module.exports.saveOAuthUserProfile = function(req, profile, done) {
    User.findOne({
        provider: profile.provider,
        providerId: profile.providerId
    }, function(err, user) {
        if (err) {
            return done(err);
        } else {
            if (!user) {
                var possibleUsername = profile.username || ((profile.email) ? profile.email.split('@')[0] : '');

                //calling a static mongoose Shema method to save the user (more on this in MEAN Book).
                //The function can be found in models/user.js
                User.findUniqueUsername(possibleUsername, null, function(availableUsername) {
                    profile.username = availableUsername;

                    user = new User(profile);

                    user.save(function(err) {
                        if (err) {
                            var message = _this.getErrorMessage(err);

                            return res.redirect('/signup');
                        }

                        return done(err, user);
                    });
                });
            } else {
                return done(err, user);
            }
        }
    });
};

module.exports.passwordRecovery = function(req, res, next) {

    async.waterfall([
        function(done) {
            //creating token
            crypto.randomBytes(20, function(err, buf) {
                var token = buf.toString('hex');
                done(err, token);
            });
        },
        function(token, done) {
            //Finds user user and saves the generated token in the DB
            console.log(req.body);
            User.findOne({username: req.body.username }, function(err, user) {
                if (!user) {
                    console.log('No account with that email address exists.');
                    res.json({success:false, message: 'The account could not be found. Please repeat the password Recovery or contact the aadministrator'});
                } else {
                    user.email = user.email || req.body.email;
                    user.resetPasswordToken = token;
                    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour

                    user.save(function(err) {
                        done(err, token, user);
                    });
                }
            });
        },
        function(token, user, done) {
            //Send Email to user with the link to reset the password
            console.log(token);
            console.log(user);

            var smtpTransport = nodemailer.createTransport({
                service: "Gmail",
                auth: {
                    user: "cnsvsjmggw@gmail.com",
                    pass: "cnsvsjmggw1234"
                }
            });
            var mailOptions = {
                to: user.email,
                from: 'passwordreset@demo.com',
                subject: 'Node.js Password Reset',
                text: 'You are receiving this because you (or someone else) have requested the reset of the password for your account.\n\n' +
                'Please click on the following link, or paste this into your browser to complete the process:\n\n' +
                'http://' + req.headers.host + '/reset/' + token + '\n\n' +
                'If you did not request this, please ignore this email and your password will remain unchanged.\n'
            };
            smtpTransport.sendMail(mailOptions, function(err) {
                console.log('An e-mail has been sent to ' + user.email + ' with further instructions.');
                done(err, user, 'done');
            });
        }
    ], function(err, user) {
        if (err) return next(err);
        res.json({success:true, message: 'An e-mail has been sent to ' + user.email + ' with further instructions.'});
    });
};

module.exports.passwordReset = function(req, res) {
    async.waterfall([
        function(done) {
            //find a user which owns the token
            User.findOne({ resetPasswordToken: req.body.token, resetPasswordExpires: { $gt: Date.now() } }, function(err, user) {
                //if user was not found redirect back to password recovery
                if (!user) {
                    console.log('Error: Password reset token is invalid or has expired.');
                    res.json({success:true, message: 'No user could be found'});
                } else {
                    var salt = authService.createSalt();
                    var hash = authService.hashPwd(salt, req.body.password);

                    user.salt = salt;
                    user.hashed_pwd = hash;
                    user.resetPasswordToken = undefined;
                    user.resetPasswordExpires = undefined;

                    user.save(function(err) {
                        done(err, user);
                    });
                }
            });
        },
        function(user, done) {
            var smtpTransport = nodemailer.createTransport('SMTP', {
                service: 'Gmail',
                auth: {
                    user: 'cqtkbnns@gmail.com',
                    pass: 'cqtkbnns1234'
                }
            });
            var mailOptions = {
                to: user.email,
                from: 'passwordreset@demo.com',
                subject: 'Your password has been changed',
                text: 'Hello,\n\n' +
                'This is a confirmation that the password for your account ' + user.email + ' has just been changed.\n'
            };
            smtpTransport.sendMail(mailOptions, function(err) {
                console.log('Success! Your password has been changed.');
                done(err, 'done');
            });
        }
    ], function(err) {
            res.json({success:true, message: 'Success! Your password has been changed.'});
    });
};
