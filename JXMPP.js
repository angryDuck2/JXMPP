/**
 * @class
 * @constructor
 * @module JXMPP
 * @desc
 * This is the main class of our XMPP module built in Javascript. It uses the Titanium TCP Socket module in order to establish a connection
 * to the XMPP Jabber service. Until further notice there is no way to establish a connection while authenticating through SSL other than 
 * simply checking the domain name that is being returned from the service to the device. This class contains 5 objects to 5 external classes
 * that are inherrited to any instance of this class. There is no constructor for this class but all the inherrited classes need to be instantiated
 * in order to be able to use them.
 */
var JXMPPJID = require('UserClass/xmppConnect/xmpp1/JXMPPJID');
var JXMPPPacket = require('UserClass/xmppConnect/xmpp1/JXMPPPacket');
var JXMPPError = require('UserClass/xmppConnect/xmpp1/JXMPPError');
var JXMPPConnection = require('UserClass/xmppConnect/xmpp1/JXMPPConnection');
var JXMPPConstants=require("UserClass/xmppConnect/xmpp1/JXMPPConstants");

var exports={};
//class

exports.JID=JXMPPJID;

exports.Packet=JXMPPPacket;

exports.XMPPError=JXMPPError;

exports.Connection=JXMPPConnection;

exports.CONSTANTS=JXMPPConstants;


exports.version = 0.2;
exports.author = 'Aggelos Papageorgiou';
module.exports=exports;
