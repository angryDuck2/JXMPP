/**
 * @memberof module:JXMPP
 */
/**
* sendRawCallBack event
*
* @event JXMPPConnection#sendRawCallBack
* @type {object}
* @property {Ti.XML} response - The Ti.XML parsed DOM object from the message received from the XMPP Server
* 
*/

/**
* message event
*
* @event JXMPPConnection#message
* @desc This is the event fired once a message type XML has been received from the XMPP Server and has been checked if it is valid for the currently connected user and is under 60 minutes from the time it was sent
* @type {String}
* @property {String} message - The message received
*/

/**
* ondisconnect event
*
* @event JXMPPConnection#ondisconnect
* @desc This is the event fired when a connection is about to be disconnected
*/

/**
* onerror event
* 
* @event JXMPPConnection#onerror
* @desc the event fired when an error in the sequence of messages is found
* argument, like this:
* @type {object}
* @property {JXMPPError} iq - An XML message containing the error that has occured <br><code>&lt;error code='404' type='cancel'&gt;<br> 
* &lt;item-not-found xmlns='urn:ietf:params:xml:ns:xmpp-stanzas'/&gt;<br>
* &lt;/error&gt;</code></li>
* 
*/

/**
* onconnect event
*
* @event JXMPPConnection#onconnect
* @desc This is the event fired when a connection is authenticated and established
*/


//internal receive buffer
var buffer = new Array();
/*	
 * @private
 * @param {Object} dispatch - this parameter is used to distribute events class wide as well as distributing any external events to any registered listeners
 * @require backbone/events
 * 
 */
var dispatch = require('/libs/dispatcher');
var Constants = require("UserClass/xmppConnect/xmpp1/JXMPPConstants");
var JXMPPPacket = require('UserClass/xmppConnect/xmpp1/JXMPPPacket');
var JXMPPError = require('UserClass/xmppConnect/xmpp1/JXMPPError');

/*** START CONFIG***/
//Aggelos addition to resend message in case no answer is given
var repeatInterval = false;

//Aggelos addition for zlib compression
var zlib=require('/libs/zlib_module/pako.min');

var JXMPP_HAVEKEYS = true;
// whether to use keys
var JXMPP_NKEYS = 16;
// number of keys to generate
var JXMPP_INACTIVITY = 300;
// qnd hack to make suspend/resume
var JXMPP_ERR_COUNT = 10;
// number of retries in case of connection
// errors
var JXMPP_ALLOW_PLAIN = true;
// whether to allow plaintext logins
var JXMPP_CHECKQUEUEINTERVAL = 1;
// msecs to poll send queue
var JXMPP_CHECKINQUEUEINTERVAL = 1;
// msecs to poll incoming queue
var JXMPP_TIMERVAL = 2000;
// default polling interval
var JXMPP_RETRYDELAY = 5000;
// msecs to wait before trying next request after error
/*** END CONFIG ***/
var that;


/**
 * Creates a new Jabber connection (a connection to a jabber server)
 * @classdesc Somewhat abstract base class for jabber connections. Contains all
 * of the code in common for all jabber connections
 * @constructor
 * @class
 * @param {Object} oArg
 * @param {Boolean} oArg.allow_plain a boolean to declare whether plain text authentication is allowed
 */



function JXMPPConnection(oArg) {
	if (oArg && oArg.allow_plain)
		/**
		 * @private
		 */
		this.allow_plain = oArg.allow_plain;
	else
		this.allow_plain = JXMPP_ALLOW_PLAIN;

	/**
	 * @private
	 */
	this._connected = false;

	/**
	 * @private
	 */
	this._autenticated = false;

	/**
	 * @private
	 */
	this._events = new Array();
	/**
	 * @private
	 */
	this._ID = 0;
	/**
	 * @private
	 */
	this._inQ = new Array();
	/**
	 * @private
	 */
	this._regIDs = new Array();
	/**
	 * @private
	 */
	this._req = null;
	/**
	 * @private
	 */
	this._status = 'intialized';
	/**
	 * @private
	 */
	this._errcnt = 0;
	/**
	 * @private
	 */
	this._sendRawCallbacks = new Array();
	/**
	 * @private
	 */
	this._pingNotSupported = false;
	/**
	 * @private
	 */
	this.compressionType = false;
	/**
	 * @private
	 */
	this._startOutboundCompression = false;
}


/**
 * This function is used to connect to a specified XMPP domain and server
 * @param {Object} oArg
 * @param {!String} oArg.domain - the domain's name or IP address that you would like to connect to
 * @param {?String} oArg.username - the username that you would like to login as on the XMPP server
 * @param {?String} oArg.resource - the resource that you would like to login with on the XMPP server
 * @param {?String} oArg.pass - the password that will be used to login to the XMPP Server
 * @param {?String} oArg.register - if in-band registration should be attempted if no user is found
 * @param {String} [oArg.authhost=oArg.domain] - the XMPP host that you would like to connect to
 * @param {String=} [oArg.authtype=sasl] - the authentication type to be user -> supported values 'non-sasl'/'sasl'/'tls'/'saslanon'/'nontls'/'anonymous'
 * @param {String=} [oArg.xmllang=en] - the xml language type to use
 * @param {!String} oArg.host - the host to which a TCP Socket connection will be established
 * @param {number} oArg.port - the port of the host to be used
 * @param {?boolean} [oArg.secure=false] - if a secure authentication should be used, this boolean should be set to true
 * @param {?String|boolean} [oArg.enableCompression=false] - if compression should be applied to the stream data - supported values 'zlib'/'lzw'/false
 * @param {boolean} [oArg.autoPing=false] - if autopinging the server should be performed
 */

JXMPPConnection.prototype.connect = function(oArg) {
	this._setStatus('connecting');
	if(!Ti.Network.online)return false;//if not connected to internet return
	this.domain = oArg.domain || 'localhost';
	this.username = oArg.username;
	this.resource = oArg.resource;
	this.pass = oArg.pass;
	this.register = oArg.register; // should try auto-registration

	this.authhost = oArg.authhost || oArg.host || oArg.domain;
	this.authtype = oArg.authtype || 'sasl'; //authType -> supported values sasl/tls/nonsasl

	if (oArg.xmllang && oArg.xmllang != '')
		this._xmllang = oArg.xmllang;
	else
		this._xmllang = 'en';

	this.host = oArg.host;
	this.port = oArg.port || 5222;
	if (oArg.secure)
		this.secure = 'true';
	else
		this.secure = 'false';

	if (oArg.wait)
		this._wait = oArg.wait;
	//enter compression type -> zlib/lzw or true
	this.compressionType = oArg.enableCompression || false;

	this.jid = this.username + '@' + this.domain;
	this.fulljid = this.jid + '/' + this.resource;

	if (oArg.autoPing == true) {
		this._pingNotSupported = false;
	} else {
		this._pingNotSupported = true;
	}
	that = this;
	// setupRequest must be done after rid is created but before first use in reqstr
	if (this._req == null || this._req.state != Titanium.Network.Socket.CONNECTED) {
		try {
			this._req = Ti.Network.Socket.createTCP({
				host : this.host,
				port : this.port,
				connected : function(e) {
					//send initial request

					var reqstr = that._getInitialRequestString();
					Ti.API.debug(reqstr);

					e.socket.write(Ti.createBuffer({
						type : Titanium.Codec.CHARSET_UTF8,
						value : reqstr
					}));
					Ti.Stream.pump(e.socket, that._pumpCallback, 1000000, true);

				},
				error : function(e) {
					Ti.API.error('Socket error');
					that.disconnect();
				},
				closed : function(e) {
					Ti.API.error('Socket close');
				},
			});
			this._req.connect();
		} catch (e) {
			Ti.API.error('Error creating socket');
			that.disconnect();
		}
	} else {
		Ti.API.error('Socket already connected');
	}
	return true;
};
/*
 * @private
 * This function is used to parse the first XMPP stream message in order to retrieve the connection id
 * to be used to verify a successfull connection to the xmpp server. 
 */
JXMPPConnection.prototype._getStreamID = function(streamData) {

	// extract stream id used for non-SASL authentication
	if (streamData.match(/id=[\'\"]([^\'\"]+)[\'\"]/))
		this.streamid = RegExp.$1;
	Ti.API.log("got streamid: " + this.streamid);

	this._connected = true;
	var doc;
	try {
		//var response = streamData + '</stream:stream>';
		doc = Ti.XML.parseString(streamData);

		if (!this._parseStreamFeatures(doc)) {
			//this.authtype = 'nonsasl';
			return;
		}
	} catch(e) {
		Ti.API.error("Error loading XML: " + e.toString());
	}

	if (this.register)
		this._doInBandReg();
	else
		this._doAuth();

	this._autenticated = true;

};
/*
 * @private
 * This function is used to split the received messages if multiple messages are included within a
 * buffer returned by the Socket
 */
JXMPPConnection.prototype._getSplitXml = function(response) {

	var xmls = new Array();
	//var reg = /<(message|iq|presence|stream|proceed|challenge|success|failure)(?=[\:\s\/>])/gi;
	var reg = /<(message|iq|presence|proceed|challenge|success)(?=[\:\s\/>])/gi;
	var tags = response.split(reg);
	if (tags.length == 1) {//not recognized tags
		xmls.push(tags[0]);
	} else {
		for ( a = 1; a < tags.length; a = a + 2) {
			xmls.push("<" + tags[a] + tags[(a + 1)]);
		}
	}
	return xmls;

};
/*
 * @private
 * This function is used to add the string </stream:stream> to a server response in order to be parsed correctly by the Ti.XML
 * module
 */
JXMPPConnection.prototype._fixXmlToParse = function(response) {

	if (response.indexOf("<stream:stream") == 0) {
		response += "</stream:stream>";
		Ti.API.log("fixed XML finish: " + response);
	}

	if (response.indexOf("<stream:features>") == 0) {
		response = "<stream:stream xmlns='jabber:client' xmlns:stream='http://etherx.jabber.org/streams' version='1.0'>" + response + "</stream:stream>";
		Ti.API.log("fixed XML: " + response);
	}
	return response;
};

/*
 * @private
 * This function is used to retrieve any and all messages from the server. It is asynchronously called from the tcp socket object
 * and is given a parameter that contains the response from the server
 */

JXMPPConnection.prototype._pumpCallback = function(e) {
	//that.oDbg.log("pumpCallback ...", 1);

	if (e.bytesProcessed == -1) {// EOF
		Ti.API.error("<EOF> - Can't perform any more operations on connected socket");
		that.disconnect();
	} else if (e.errorDescription == null || e.errorDescription == "") {
		Ti.API.debug("DATA>>>: " + e.buffer.toString());
		var data = e.buffer.toString();
		if(that._startOutboundCompression){
			try {
			  data = zlib.inflate(e.buffer.toBlob().text);
			} catch (err){
			  Titanium.API.info(err);
			}
		}
		repeatInterval = false;
		if(data===undefined)return;
		e.buffer.clear();

		if (data.length < 10)
			return;
		data = data.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&g/g, '>').replace(/&gt;/g, '>');
		
		if (data.indexOf("ping") >= 0) {
			try{
				that._doAutoPing(Ti.XML.parseString(data));
				that.registerHandler('autoPing', that._doAutoPingResult);
				return;
			}catch(err){
				Ti.API.info('error parsing autoping request '+err.description);
			}
		}
		//fix xml finish and prefix
		var response = data.replace(/\<\?xml.+\?\>/, "");
		if (response.indexOf("</stream:stream>") == 0 || response.indexOf('stream:error')>0) {
			Ti.API.error("end connection XML: " + response);
			that.disconnect();
			return;
		}
		//if connection id is retrieved from first xmpp message
		if (that.autenticated()) {
			var xmls = that._getSplitXml(response);
			for ( i = 0; i < xmls.length; i++) {
				var xml=new String(10000);
				xml= xmls[i];
				xml = that._fixXmlToParse(xml);
				Ti.API.info('index message: ' + xml.indexOf('<message') + '\nindex /message: '+xml.indexOf('</message>'));
				if (xml.indexOf('<message') >= 0 && xml.indexOf('</message>') < 0 && xmls.length < 2) {
					buffer.push(xml);
					break;
				}
				if (buffer.length >= 1 && (xml.indexOf('<message') < 0 && xml.indexOf('</message>') < 0)) {
					buffer.push(xml);
					break;
				}
				// ensures that even though the message gets broken up we can safelly recreate it
				if (xml.indexOf('<message') < 0 && xml.indexOf('</message>') > 0) {
					buffer.push(xml);
					xml = buffer.toString();
					xml=xml.replace(/,/g,'');
					Ti.API.info(xml.substr(4000,8000));
					buffer = new Array();
				}
				//if a message has multiple message tags inside it this method ensures that we get the full message
				if (xml.indexOf('<message') >= 0 && xml.indexOf('</message>') < 0 && xmls.length > 1) {
					for (i++; i < xmls.length; i++) {
						xml += xmls[i];
						if (xml.indexOf('</message') > 0) {
							break;
						}
					}
				}
				Ti.API.info("_handleResponse: " + xml);
				xml = xml.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&g/g, '>').replace(/&gt;/g, '>');
				//Ti.API.info("_handleResponse2: " + xml);
				that._handleResponse(xml);
			}
		} else {
			response = that._fixXmlToParse(response);
			that._getStreamID(response);
		}

	} else {
		Ti.API.error("READ ERROR: " + e.errorDescription);
		that.disconnect();
	}
};

/*
 * @private
 * Messages are sent to this function after having verified that they are valid
 */

JXMPPConnection.prototype._handleMessage = function(message) {
	var data=message;
	that._handleEvent('message', data);

};

/*
 * @private
 * Used to build the first message to the xmpp server
 */

JXMPPConnection.prototype._getInitialRequestString = function() {
	var reqstr = "<stream:stream to='" + this.host + "' xmlns='jabber:client' xmlns:stream='http://etherx.jabber.org/streams' version='1.0'>";
	return reqstr;
};

/**
 * Tells whether this connection is connected
 * @return <code>true</code> if this connections is connected,
 * <code>false</code> otherwise
 * @type boolean
 */
JXMPPConnection.prototype.connected = function() {
	return this._connected;
};
/**
 * Tells whether this connection is authenticated with an id
 * @return <code>true</code> if this connections is authenticated,
 * <code>false</code> otherwise
 * @type boolean
 */
JXMPPConnection.prototype.autenticated = function() {
	return this._autenticated;
};

/**
 * Disconnects from jabber server and terminates session (if applicable)
 * @param {boolean} shouldRetry if true this function does not retry to start the connection 
 */
JXMPPConnection.prototype.disconnect = function(shouldRetry) {
	if(this._pingInterval)clearInterval(this._pingInterval);
		if (!this.connected())
			return;
	this.unregisterHandler('sendRawCallBack');
	var prevObj = new Object();
	prevObj.domain = this.domain;
	prevObj.username = this.username;
	prevObj.resource = this.resource;
	prevObj.pass = this.pass;
	prevObj.register = this.register;

	prevObj.authhost = this.authhost;
	prevObj.authtype = this._tlsFinalized==true ? this.authtype : 'tls';
	this._tlsFinalized=false;
	prevObj.xmllang = this.xmllang;
	prevObj.host = this.host;
	prevObj.port = this.port;
	prevObj.secure = this.secure;
	prevObj.wait = this.wait;
	prevObj.autoPing = true;

	this.prevCreds = prevObj;
	this._connected = false;
	var request = '</stream:stream>';
	Ti.API.log("Disconnecting: " + request);
	this._sendRaw(request);
	this._sendRaw(request);
	try {
		if(this._req.state!=16 && this._req.state!=8)this._req.close();
	} catch(err) {
		Ti.API.error(err.description);
	} finally {
		this._req = null;
		if(shouldRetry==false)return;
		this._handleEvent('ondisconnect');
		this._autenticated = false;
		var reconnect = setInterval(function() {
			if(!Titanium.Network.online && reconnect!==undefined)return;
			if (that._connected == true) {
				clearInterval(reconnect);
				return;
			}
			that.connect(that.prevCreds);
		}, 3000);
	}

};

/**
 * Registers an event handler (callback) for this connection.
 * <p>Note: All of the packet handlers for specific packets (like
 * message_in, presence_in and iq_in) fire only if there's no
 * callback associated with the id.<br>
 * <p>Example:<br/>
 * <code>con.registerHandler('iq', 'query', 'jabber:iq:version', handleIqVersion);</code>
 * @param {String} event One of
 * <ul>
 * <li>onConnect - connection has been established and authenticated</li>
 * <li>onDisconnect - connection has been disconnected</li>
 * <li>onResume - connection has been resumed</li>
 * <li>onStatusChanged - connection status has changed, current
 * status as being passed argument to handler. See {@link #status}.</li>
 * <li>onError - an error has occured, error node is supplied as
 * argument, like this:<br><code>&lt;error code='404' type='cancel'&gt;<br>
 * &lt;item-not-found xmlns='urn:ietf:params:xml:ns:xmpp-stanzas'/&gt;<br>
 * &lt;/error&gt;</code></li>
 * <li>packet_in - a packet has been received (argument: the
 * packet)</li>
 * <li>packet_out - a packet is to be sent(argument: the
 * packet)</li>
 * <li>message_in | message - a message has been received (argument:
 * the packet)</li>
 * <li>message_out - a message packet is to be sent (argument: the
 * packet)</li>
 * <li>presence_in | presence - a presence has been received
 * (argument: the packet)</li>
 * <li>presence_out - a presence packet is to be sent (argument: the
 * packet)</li>
 * <li>iq_in | iq - an iq has been received (argument: the packet)</li>
 * <li>iq_out - an iq is to be sent (argument: the packet)</li>
 * </ul>
 * @param {String} childName A childnode's name that must occur within a
 * retrieved packet [optional]
 * @param {String} childNS A childnode's namespace that must occure within
 * a retrieved packet (works only if childName is given) [optional]
 * @param {String} type The type of the packet to handle (works only if childName and chidNS are given (both may be set to '*' in order to get skipped) [optional]
 * @param {Function} handler The handler to be called when event occurs. If your handler returns 'true' it cancels bubbling of the event. No other registered handlers for this event will be fired.
 */
JXMPPConnection.prototype.registerHandler = function(event) {
	event = event.toLowerCase();
	// don't be case-sensitive here
	var eArg = {
		handler : arguments[arguments.length - 1],
		childName : '*',
		childNS : '*',
		type : '*'
	};
	if (arguments.length > 2)
		eArg.childName = arguments[1];
	if (arguments.length > 3)
		eArg.childNS = arguments[2];
	if (arguments.length > 4)
		eArg.type = arguments[3];
	if (!this._events[event])
		this._events[event] = new Array(eArg);
	else
		this._events[event] = this._events[event].concat(eArg);
	Ti.API.info("registered handler for event '" + event + "'");
	dispatch.on(event, eArg.handler,this);
};
/**
 * @desc This function removes any previously added handlers to any event fired from this classe's objects without checking if a handler exists
 * @param {String} event - The event to which you want to remove the listener
 * @param {Function} handler - The handler function which you wish to remove from the event, if not provided all handlers for the specified event are removed
 */
JXMPPConnection.prototype.unregisterHandler = function(event, handler) {
	event = event.toLowerCase();
	// don't be case-sensitive here
	Ti.API.info("unregistered handler for event '" + event + "'");
	if(handler){dispatch.off(event, handler);return;}
	for(var i=0;i<this._events[event].length;i++){var hand=this._events[event].pop();dispatch.off(event,hand.handler);}
};

/**
 * Register for iq packets of type 'get'.
 * @param {String} childName A childnode's name that must occur within a
 * retrieved packet
 * @param {String} childNS A childnode's namespace that must occure within
 * a retrieved packet (works only if childName is given)
 * @param {Function} handler The handler to be called when event occurs. If your handler returns 'true' it cancels bubbling of the event. No other registered handlers for this event will be fired.
 */
JXMPPConnection.prototype.registerIQGet = function(childName, childNS, handler) {
	this.registerHandler('iq', childName, childNS, 'get', handler);
};

/**
 * Register for iq packets of type 'set'.
 * @param {String} childName A childnode's name that must occur within a
 * retrieved packet
 * @param {String} childNS A childnode's namespace that must occure within
 * a retrieved packet (works only if childName is given)
 * @param {Function} handler The handler to be called when event occurs. If your handler returns 'true' it cancels bubbling of the event. No other registered handlers for this event will be fired.
 */
JXMPPConnection.prototype.registerIQSet = function(childName, childNS, handler) {
	this.registerHandler('iq', childName, childNS, 'set', handler);
};

/**
 * Sends a JXMPPPacket
 * @param {JXMPPPacket} packet  The packet to send
 * @param {Function}    cb      The callback to be called if there's a reply
 * to this packet (identified by id) [optional]
 * @param {Object}      arg     Arguments passed to the callback
 * (additionally to the packet received) [optional]
 * @return 'true' if sending was successfull, 'false' otherwise
 * @type boolean
 * @deprecated Please use _sendRaw
 */
JXMPPConnection.prototype.send = function(packet, cb, arg) {
	if (!packet || !packet.pType) {
		Ti.API.error("no packet: " + packet);
		return false;
	}

	if (!this.connected())
		return false;

	// if (this._xmllang && !packet.getXMLLang())
	//   packet.setXMLLang(this._xmllang);

	// remember id for response if callback present
	if (cb) {
		// generate an ID
		if (!packet.getID()) {
			packet.setID('JXMPPID_' + this._ID++);
		}

		// register callback with id
		this._registerPID(packet.getID(), cb, arg);
	}

	try {
		this._handleEvent(packet.pType() + '_out', packet);
		this._handleEvent("packet_out", packet);

		Ti.API.info("Send IQ:" + packet.xml());
		this._sendRaw(packet.xml());
	} catch (e) {
		Ti.API.error("Error sendig ID:" + e.toString());
		return false;
	}

	return true;
};

/**
 * Sends an IQ packet. Has default handlers for each reply type.
 * Those maybe overriden by passing an appropriate handler.
 * @param {JXMPPIQPacket} iq - the iq packet to send
 * @param {Object} handlers - object with properties 'error_handler',
 *                            'result_handler' and 'default_handler'
 *                            with appropriate functions
 * @param {Object} arg - argument to handlers
 * @return 'true' if sending was successfull, 'false' otherwise
 * @type boolean
 */
JXMPPConnection.prototype.sendIQ = function(iq, handlers, arg) {
	if (!iq || iq.pType() != 'iq') {
		return false;
	}

	handlers = handlers || {};
	var error_handler = handlers.error_handler ||
	function(aIq) {
		Ti.API.error(aIq.xml());
	};

	var result_handler = handlers.result_handler ||
	function(aIq) {
		Ti.API.info(aIq.xml());
	};

	var iqHandler = function(aIq, arg) {
		switch (aIq.getType()) {
		case 'error':
			error_handler(aIq);
			break;
		case 'result':
			result_handler(aIq, arg);
			break;
		}
	};
	return this.send(iq, iqHandler, arg);
};

/**
 * Returns current status of this connection
 * @return String to denote current state. One of
 * <ul>
 * <li>'initializing' ... well
 * <li>'connecting' if connect() was called
 * <li>'resuming' if resume() was called
 * <li>'processing' if it's about to operate as normal
 * <li>'onerror_fallback' if there was an error with the request object
 * <li>'protoerror_fallback' if there was an error at the http binding protocol flow (most likely that's where you interested in)
 * <li>'internal_server_error' in case of an internal server error
 * <li>'suspending' if suspend() is being called
 * <li>'aborted' if abort() was called
 * <li>'disconnecting' if disconnect() has been called
 * </ul>
 * @type String
 */
JXMPPConnection.prototype.status = function() {
	return this._status;
};

/**
 * @private
 */
JXMPPConnection.prototype._abort = function() {
	this._connected = false;
	this._setStatus('aborted');
	this._req.close();
	Ti.API.error("Disconnected.");
	this._handleEvent('ondisconnect');
	this._handleEvent('onerror', JXMPPError.create('500', 'cancel', 'service-unavailable'));
};

/**
 * @private
 */
JXMPPConnection.prototype._checkInQ = function() {
	for (var i = 0; i < this._inQ.length && i < 10; i++) {
		var item = this._inQ[0];
		this._inQ = this._inQ.slice(1, this._inQ.length);
		var packet = JXMPPPacket.Packet.wrapNode(item);

		if (!packet)
			return;

		this._handleEvent("packet_in", packet);

		if (packet.pType && !this._handlePID(packet)) {
			this._handleEvent(packet.pType() + '_in', packet);
			this._handleEvent(packet.pType(), packet);
		}
	}
};

/**
 * @private
 * @listens JXMPPConnection#sendRawCallBack
 */
JXMPPConnection.prototype._doAuth = function() {
	if (this.has_sasl && this.authtype == 'nonsasl')
		Ti.API.error("Warning: SASL present but not used");

	if (!this._doTLSAuth() && !this._doSASLAuth() && !this._doLegacyAuth()) {
		Ti.API.error("Auth failed for authtype " + this.authtype);
		this.disconnect();
		return false;
	}
	return true;
};

/**
 * @private
 * performs an in-band registration if allowed from the server
 * @listens JXMPPConnection#sendRawCallBack
 */
JXMPPConnection.prototype._doInBandReg = function() {
	if (this.authtype == 'saslanon' || this.authtype == 'anonymous')
		return;
	// bullshit - no need to register if anonymous

	/* ***
	 * In-Band Registration see JEP-0077
	 */

	var iq = new JXMPPPacket.JXMPPIQ();
	iq.setType('set');
	iq.setID('reg1');
	iq.appendNode("query", {
		xmlns : Constants.NS_REGISTER
	}, [["username", this.username], ["password", this.pass]]);

	this.send(iq, this._doInBandRegDone);
};

/**
 * @private
 * it is fired upon successfull or unsuccessfull registration and continues with logging in to the server if the registration is successfull otherwise it fires the onerror event
 * @listens JXMPPConnection#sendRawCallBack
 * @fires JXMPPConnection#onerror
 */
JXMPPConnection.prototype._doInBandRegDone = function(iq) {
	if (iq && iq.getType() == 'error') {// we failed to register
		Ti.API.error("registration failed for " + this.username);
		this._handleEvent('onerror', iq.getChild('error'));
		return;
	}

	Ti.API.info(this.username + " registered succesfully");

	this._doAuth();
};

/**
 * @private
 * It is fired upon receiving a ping request from the server and from then on every 15 seconds sends a ping request to verify the connection to be alive if no ping response is given within 15 seconds the connection is restarted
 * @param {Ti.XML} data - The Ti.XML parsed data given to the function from the event autoPing
 * @listens JXMPPConnection#autoPing
 */

JXMPPConnection.prototype._doAutoPing = function(data) {
	if (this._pingNotSupported == true)
		return;
	var type;
	if (Ti.Platform.getOsname() == 'iphone') {
		type = data.documentElement.getAttribute('type');
	} else {
		type = data.getDocumentElement().attributes.getNamedItem('type').nodeValue;
	}
	if (type != 'get' && type != 'result')
		this._pingNotSupported = true;
	this._sendRaw("<iq from='" + this.fulljid + "' to='" + this.domain + "' id='" + this.streamid + "' type='result'/>");
	this._pingInterval=setInterval(function() {
		if (!that._pingNotSupported) {
			that._sendRaw("<iq from='" + that.fulljid + "' to='" + that.domain + "' id='c2s1' type='get'><ping xmlns='urn:xmpp:ping'/></iq>");
			that._pingNotSupported = true;
		} else {
			that.disconnect();
		}
	}, 15000);
};

/**
 * @private
 * this function handles the response of autoping from the server
 */

JXMPPConnection.prototype._doAutoPingResult = function(data) {
	var type;
	if (Ti.Platform.getOsname() == 'iphone') {
		type = data.documentElement.getAttribute('type');
	} else {
		type = data.getDocumentElement().attributes.getNamedItem('type').nodeValue;
	}
	if (type == 'result')
		this._pingNotSupported = false;
};

/**
 * @private
 * performs first step to completing a non-sasl authorization to the XMPP Server as described in XEP-0078
 * @listens JXMPPConnection#sendRawCallBack
 */
JXMPPConnection.prototype._doLegacyAuth = function() {
	if (this.authtype != 'nonsasl' && this.authtype != 'anonymous')
		return false;

	/* ***
	* Non-SASL Authentication as described in XEP-0078
	*/
	// var iq = new JXMPPPacket.JXMPPIQ();
	// iq.setIQ(null, 'get', 'auth1');
	// iq.appendNode('query', {
	// xmlns : Constants.NS_AUTH
	// }, [['username', this.username]]);
	this.unregisterHandler('sendRawCallBack', this._doLegacyAuth);
	this._sendRaw("<?xml version='1.0' encoding='UTF-8'?><iq type='get' to='" + this.domain + "' id='" + this.streamid + "'><query xmlns='jabber:iq:auth'><username>" + this.username + "</username></query></iq>", this._doLegacyAuth2);

	//this.send(iq, this._doLegacyAuth2);
	return true;
};

/**
 * @private
 * performs second step to completing a non-sasl authorization to the XMPP Server as described in XEP-0078 
 * @listens JXMPPConnection#sendRawCallBack
 */
JXMPPConnection.prototype._doLegacyAuth2 = function(iq) {
	var temp = new JXMPPPacket.JXMPPIQ();
	var temp = "<?xml version='1.0' encoding='UTF-8'?><iq type='set' id='" + this.streamid + "'>\
	<query xmlns='jabber:iq:auth'><username>" + this.username + "</username><resource>" + this.resource + "</resource>";
	var use_digest = (iq.getElementsByTagName('digest').length != 0);

	/* ***
	 * Send authentication
	 */

	if (use_digest) {// digest login
		temp += '<password>' + hex_sha1(this.streamid + this.pass) + '</password>';
	} else if (this.allow_plain) {// use plaintext auth
		temp += "<password>" + this.pass + "</password>";
	} else {
		Ti.API.error("no valid login mechanism found");
		this.disconnect();
		return;
	}

	temp += "</query></iq>";
	this.unregisterHandler('sendRawCallBack', this._doLegacyAuth2);
	this._sendRaw(temp, this._doLegacyAuthDone);
};

/**
 * @private
 * performs final step to completing a non-sasl authorization to the XMPP Server as described in XEP-0078 and fires an onerror event if unsuccessfull and an onconnect event if successfull
 * @param {Ti.XML} data - The Ti.XML parsed data given to the function from the event sendRawCallBack
 * @listens JXMPPConnection#sendRawCallBack
 * @fires JXMPPConnection#onerror
 */
JXMPPConnection.prototype._doLegacyAuthDone = function(iq) {

	if (Ti.Platform.name == 'android') {
		if (iq.getAttribute('type') != 'result') {// auth' failed
			if (iq.getNodeType() == 'error')
				this._handleEvent('onerror', iq.getChild('error'));
			this.disconnect();
		} else
			this._handleEvent('onconnect');
	}
	this.unregisterHandler('sendRawCallBack', this._doLegacyAuthDone);
};

/**
 * @private
 * @listens JXMPPConnection#sendRawCallBack
 */
JXMPPConnection.prototype._doSASLAuth = function() {
	if (this.authtype == 'nonsasl' || this.authtype == 'anonymous' || this.authtype == 'tls')
		return false;
	if (this.authtype == 'saslanon') {
		if (this.mechs['ANONYMOUS']) {
			Ti.API.info("SASL using mechanism 'ANONYMOUS'");
			this.unregisterHandler('sendRawCallBack', this._doSASLAuth);
			return this._sendRaw("<auth xmlns='urn:ietf:params:xml:ns:xmpp-sasl' mechanism='ANONYMOUS'/>", this._doSASLAuthDone);
		}
		Ti.API.error("SASL ANONYMOUS requested but not supported");

	} else {
		if (this.mechs['DIGEST-MD5']) {
			Ti.API.info("SASL using mechanism 'DIGEST-MD5'");
			this.unregisterHandler('sendRawCallBack', this._doSASLAuth);
			this._sendRaw("<auth xmlns='urn:ietf:params:xml:ns:xmpp-sasl' mechanism='DIGEST-MD5'/>", this._doSASLAuthDigestMd5S1);
			return true;
		} else if (this.allow_plain && this.mechs['PLAIN']) {
			Ti.API.info("SASL using mechanism 'PLAIN'");
			var authStr = this.username + '@' + this.domain + String.fromCharCode(0) + this.username + String.fromCharCode(0) + this.pass;
			Ti.API.error("authenticating with '" + authStr + "'");
			this.unregisterHandler('sendRawCallBack', this._doSASLAuth);
			this._sendRaw("<auth xmlns='urn:ietf:params:xml:ns:xmpp-sasl' mechanism='PLAIN'>" + authStr + "</auth>", this._doSASLAuthDone);
			return true;
		}
		Ti.API.error("No SASL mechanism applied");
		if (this.authtype != 'tls')
			this.authtype = 'nonsasl';
		// fallback
	}

	return false;
};

/**
 * @private
 * @listens JXMPPConnection#sendRawCallBack
 */
JXMPPConnection.prototype._doSASLAuthDigestMd5S1 = function(el) {
	var nodename = el.nodeName;
	if (el.nodeName.indexOf('#') == 0)
		nodename = el.parentNode.nodeName;
	if (nodename != 'challenge') {
		Ti.API.error("challenge missing");
		//this._handleEvent('onerror', JXMPPError.create('401', 'auth', 'not-authorized'));
		this.unregisterHandler('sendRawCallBack', this._doSASLAuthDigestMd5S1);
		this.disconnect();
	} else {
		this.unregisterHandler('sendRawCallBack', this._doSASLAuthDigestMd5S1);
		Ti.API.info(el.textContent);
		var challenge = b64decode(el.textContent);

		Ti.API.info("got challenge: " + challenge);
		this._nonce = challenge.substring(challenge.indexOf("nonce=") + 7);
		this._nonce = this._nonce.substring(0, this._nonce.indexOf("\""));
		Ti.API.info("nonce: " + this._nonce);
		if (that._nonce == '' || this._nonce.indexOf('\"') != -1) {
			Ti.API.error("nonce not valid, aborting");
			this.disconnect();
			return;
		}

		this._digest_uri = "xmpp/";
		//     if (typeof(this.host) != 'undefined' && this.host != '') {
		//       this._digest-uri += this.host;
		//       if (typeof(this.port) != 'undefined' && this.port)
		//         this._digest-uri += ":" + this.port;
		//       this._digest-uri += '/';
		//     }
		this._digest_uri += that.domain;

		this._cnonce = cnonce(26);

		this._nc = '00000001';

		var A1 = str_md5(this.username + ':' + this.domain + ':' + this.pass) + ':' + this._nonce + ':' + this._cnonce;

		var A2 = 'AUTHENTICATE:' + that._digest_uri;

		var response = hex_md5(hex_md5(A1) + ':' + this._nonce + ':' + this._nc + ':' + this._cnonce + ':auth:' + hex_md5(A2));

		var rPlain = 'username="' + this.username + '",realm="' + this.domain + '",nonce="' + this._nonce + '",cnonce="' + this._cnonce + '",nc="' + this._nc + '",qop=auth,digest-uri="' + this._digest_uri + '",response="' + response + '",charset="utf-8"';

		Ti.API.info("response: " + rPlain);
		this._sendRaw("<response xmlns='urn:ietf:params:xml:ns:xmpp-sasl'>" + binb2b64(str2binb(rPlain)) + "</response>", this._doSASLAuthDigestMd5S2);
	}
};
/*
 * @private
 * XMPP message sent to server to reinitialize connection
 */
JXMPPConnection.prototype._reInitStream = function(to, cb) {
	this._sendRaw("<?xml version='1.0'?><stream:stream xmlns:stream='http://etherx.jabber.org/streams' xmlns='jabber:client' to='" + to + "' version='1.0'>", cb);
};
/**
 * @private
 * @listens JXMPPConnection#sendRawCallBack
 */
JXMPPConnection.prototype._doSASLAuthDigestMd5S2 = function(el) {
	var nodename = el.nodeName;
	if (nodename.indexOf('#') == 0)
		nodename = el.parentNode.nodeName;
	if (nodename == 'failure') {
		if (el.xml)
			Ti.API.error("auth error: " + el.xml);
		else
			Ti.API.error("auth error");
		//this._handleEvent('onerror', JXMPPError.create('401', 'auth', 'not-authorized'));
		this.unregisterHandler('sendRawCallBack', this._doSASLAuthDigestMd5S2);
		this.disconnect();
		return;
	}
	this.unregisterHandler('sendRawCallBack', this._doSASLAuthDigestMd5S2);
	var response;
	response = b64decode(el.textContent);
	Ti.API.info("response: " + response);

	var rspauth = response.substring(response.indexOf("rspauth=") + 8);
	Ti.API.info("rspauth: " + rspauth);

	var A1 = str_md5(this.username + ':' + this.domain + ':' + this.pass) + ':' + this._nonce + ':' + this._cnonce;

	var A2 = ':' + that._digest_uri;

	var rsptest = hex_md5(hex_md5(A1) + ':' + this._nonce + ':' + this._nc + ':' + this._cnonce + ':auth:' + hex_md5(A2));
	Ti.API.info("rsptest: " + rsptest);

	if (rsptest != rspauth) {
		Ti.API.error("SASL Digest-MD5: server repsonse with wrong rspauth");
		this.disconnect();
		return;
	}

	if (nodename == 'success') {
		this._shouldCompressStream();
		//this._reInitStream(this.domain, this._doStreamBind);
	} else {// some extra turn
		this._sendRaw("<response xmlns='urn:ietf:params:xml:ns:xmpp-sasl'/>", this._doSASLAuthDone);
	}
};

/**
 * @private
 * @listens JXMPPConnection#sendRawCallBack
 */
JXMPPConnection.prototype._doSASLAuthDone = function(el) {
	if (el.nodeName != 'success') {
		Ti.API.error("auth failed");
		this.unregisterHandler('sendRawCallBack', this._doSASLAuthDone);
		this._handleEvent('onerror', JXMPPError.create('401', 'auth', 'not-authorized'));
		this.disconnect();
	} else {
		this.unregisterHandler('sendRawCallBack', this._doSASLAuthDone);
		this._reInitStream(this.domain, this._shouldCompressStream);
	}
};
/*
 * @private
 * @listens JXMPPConnection#sendRawCallBack
 */
JXMPPConnection.prototype._doTLSAuth = function() {
	if (this.authtype == 'nontls' || this.authtype == 'anonymous' || this.authtype == 'sasl')
		return false;

	if (this.mechs['EXTERNAL']) {
		Ti.API.info("TLS using mechanism 'EXTERNAL'");
		//this.authtype='sasl';
		return this._sendRaw("<starttls xmlns='urn:ietf:params:xml:ns:xmpp-tls' />", this._doTLSAuthing);
	}
	if (this.mechs['DIGEST-MD5']) {
		Ti.API.info("TLS using mechanism 'DIGEST-MD5'");
		//this.authtype='sasl';
		this._sendRaw("<starttls xmlns='urn:ietf:params:xml:ns:xmpp-tls' />", this._doTLSAuthing);
		return true;
	} else if (this.allow_plain && this.mechs['PLAIN']) {
		Ti.API.info("TLS using mechanism 'PLAIN'");
		//this.authtype='sasl';
		var authStr = this.username + '@' + this.domain + String.fromCharCode(0) + this.username + String.fromCharCode(0) + this.pass;
		Ti.API.error("authenticating with '" + authStr + "'");
		authStr = b64encode(authStr);
		this._sendRaw("<starttls xmlns='urn:ietf:params:xml:ns:xmpp-tls' />", this._doTLSAuthing);
		return true;
	}
	Ti.API.error("No TLS mechanism applied");
	this.authtype = 'nontls';
	// fallback
	return false;
};
/*
 * @private
 * @listens JXMPPConnection#sendRawCallBack
 */
JXMPPConnection.prototype._doTLSAuthing = function(data) {
	this.unregisterHandler('sendRawCallBack', this._doTLSAuthing);
	if (data.nodeName == 'proceed') {
		this._autenticated = false;
		this.authtype = 'sasl';
		var reqstr = this._getInitialRequestString();
		this._sendRaw("</stream:stream>");
		this._sendRaw(reqstr);
		this._tlsFinalized=true;
		return true;
	} else {
		Ti.API.info('Failed to finalize tls protocol');
		this.disconnect();
		return false;
	}
};
/**
 * @private
 * @listens JXMPPConnection#sendRawCallBack
 */
JXMPPConnection.prototype._doStreamBind = function() {
	this.unregisterHandler('sendRawCallBack', that._doStreamBind);
	repeatInterval = true;
	this._sendRaw("<iq  type='set' id='bind_1'><bind xmlns='urn:ietf:params:xml:ns:xmpp-bind'><resource>" + this.resource + "</resource></bind></iq>", this._doXMPPSess);
};

/**
 * @private
 * @listens JXMPPConnection#sendRawCallBack
 */
JXMPPConnection.prototype._doXMPPSess = function(iq) {
	this.unregisterHandler('sendRawCallBack', this._doXMPPSess);
	if (Ti.Platform.osname == 'ipad' || Ti.Platform.osname == 'iphone')
		iq = iq.parentNode;
	if (iq.attributes.getNamedItem('type').nodeValue != 'result' || iq.attributes.getNamedItem('type').nodeValue == 'error') {// failed
		this.disconnect();
		if (iq.getType() == 'error')
			this._handleEvent('onerror', iq.getChild('error'));
		return;
	}
	this._sendRaw("<iq type='set' id='sess_1'><session xmlns='urn:ietf:params:xml:ns:xmpp-session' /></iq>", this._doXMPPSessDone);
};

/**
 * @private
 * @listens JXMPPConnection#sendRawCallBack
 */
JXMPPConnection.prototype._doXMPPSessDone = function(iq) {
	if (iq.documentElement.attributes.getNamedItem('type').nodeValue != 'result' || iq.documentElement.attributes.getNamedItem('type').nodeValue == 'error') {// failed
		this.disconnect();
		if (iq.getType() == 'error')
			this._handleEvent('onerror', iq.getChild('error'));
	}
	this.unregisterHandler('sendRawCallBack', this._doXMPPSessDone);
	this._handleEvent('onconnect');
	
};

/**
 * @private
 * this function initiates the compression sequence of messages to initiate a compressed stream with the XMPP server
 * @listens JXMPPConnection#sendRawCallBack
 */
JXMPPConnection.prototype._shouldCompressStream = function() {
	this.unregisterHandler('sendRawCallBack', this._shouldCompressStream);
	if (this.compressionType != false) {
		if (!this.compressionType == true) {
			if (this.compTypes[that.compressionType])
				this._sendRaw("<compress xmlns='http://jabber.org/protocol/compress'><method>" + this.compressionType + "</method></compress>", this._compressStreamDone);
		} else {
			if (this.compTypes['zlib']) {
				this._sendRaw("<compress xmlns='http://jabber.org/protocol/compress'><method>zlib</method></compress>", this._compressStreamDone);
			} else if (that.compTypes['lzw']) {
				that._sendRaw("<compress xmlns='http://jabber.org/protocol/compress'><method>lzw</method></compress>", this._compressStreamDone);
			} else {
				this._reInitStream(that.domain, that._doStreamBind);
				Ti.API.error('No known compression method found. Stream will remain uncompressed');
			}
		}
	} else {
		this._doStreamBind();
	}
};

/**
 * @private
 * This function finalizes the initiation of compression or shuts down the compressed stream if an error is sent according to XEP-0138. After the successfull end of this function all messages are compressed according to the selected type of compression
 * @listens JXMPPConnection#sendRawCallBack
 */
JXMPPConnection.prototype._compressStreamDone = function(el) {
	this.unregisterHandler('sendRawCallBack', this._compressStreamDone);
	if (el.nodeName != 'compressed') {
		Ti.API.error('Initiation of compressed stream failed. Connection will be shut down');
		this.compressionType = false;
		this.disconnect();
		
	} else {
		this._startOutboundCompression=true;
		this._reInitStream(that.domain, that._doStreamBind);
	}
};

/**
 * @private
 * @desc fires any events when being called
 * @param {String} event - the name of the event to fire
 * @param {Object} arg - any parameters to pass to the handler of the event being fired
 * @fires JXMPPConnection#sendRawCallBack
 * @fires JXMPPConnection#message
 * @fires JXMPPConnection#ondisconnect
 * @fires JXMPPConnection#onerror
 * @fires JXMPPConnection#onconnect
 */
JXMPPConnection.prototype._handleEvent = function(event, arg) {
	event = event.toLowerCase();
	// don't be case-sensitive here
	Ti.API.info("incoming event '" + event + "'");
	dispatch.trigger(event, arg, this);
};

/**
 * @private
 */
JXMPPConnection.prototype._handlePID = function(aJXMPPPacket) {
	if (!aJXMPPPacket.getID())
		return false;
	for (var i in this._regIDs) {
		if (this._regIDs.hasOwnProperty(i) && this._regIDs[i] && i == aJXMPPPacket.getID()) {
			var pID = aJXMPPPacket.getID();
			Ti.API.info("handling " + pID);
			try {
				if (this._regIDs[i].cb.call(this, aJXMPPPacket, this._regIDs[i].arg) === false) {
					// don't unregister
					return false;
				} else {
					this._unregisterPID(pID);
					return true;
				}
			} catch (e) {
				// broken handler?
				Ti.API.error(e.name + ": " + e.message);
				this._unregisterPID(pID);
				return true;
			}
		}
	}
	return false;
};

/**
 * @private
 * This function gets sent all the XMPP messages regardless of their content and are redirected according to what type they are
 * @fires JXMPPConnection#onerror
 * @fires JXMPPConnection#ondisconnect
 * @fires JXMPPConnection#autoPing
 * @fires JXMPPConnection#sendRawCallBack
 */
JXMPPConnection.prototype._handleResponse = function(data) {
	// if (doc.getElementsByTagName('message').length > 0) {
	// //Aggelos addition
	// for(var i=0;i<=doc.getElementsByTagName('message').item(0).childNodes.length;i++){
	//
	// if(doc.getElementsByTagName('received').length>0)Ti.API.info('foundit!!!');
	// }
	// if(doc.firstChild.nodeName=='received')this._handleEvent('receipt',doc.firstChild);
	// this._authenticateMessage(data);
	// return;
	//
	// }
	var data1=data;
	if (data1.indexOf('message') > 0) {
		//Aggelos addition
		// for(var i=0;i<=doc.getElementsByTagName('message').item(0).childNodes.length;i++){
		//
		// if(doc.getElementsByTagName('received').length>0)Ti.API.info('foundit!!!');
		// }
		// if(doc.firstChild.nodeName=='received')this._handleEvent('receipt',doc.firstChild);
		this._discardMessage(data1);
		return;

	}
	var doc = Ti.XML.parseString(data1);

	if (!doc || doc.tagName == 'parsererror') {
		Ti.API.error("parsererror");
		return;
	}

	if (doc.getElementsByTagName('conflict').length > 0) {
		this._setStatus("session-terminate-conflict");
		this._handleEvent('onerror', JXMPPError.create('503', 'cancel', 'session-terminate'));
		this._handleEvent('ondisconnect');
		this._req.close();
		Ti.API.error("Disconnected.");
	}

	if (doc.getElementsByTagName('iq').length > 0) {
		if (doc.documentElement.getAttribute('id') == 'c2s1') {
			this._handleEvent('autoPing', doc);
			return;
		}

	}
	if (doc.nodeName == "proceed")
		this._handleEvent('sendRawCallBack', doc);
	if (doc.nodeName == "response")
		this._handleEvent('sendRawCallBack', doc);
	if (data.indexOf('sess_1') > 0)
		this._handleEvent('sendRawCallBack', doc);
	for (var i = 0; i < doc.childNodes.length; i++) {
		if (this._sendRawCallbacks) {
			// var cb = this._sendRawCallbacks[0];

			Ti.API.debug("Current CallBack!");

			// this._sendRawCallbacks = this._sendRawCallbacks.slice(1, this._sendRawCallbacks.length);
			// Ti.App.fireEvent('sendRawCallBack',doc.childNodes.item(i));//cb.fn.call(this, doc.childNodes.item(i), cb.arg);
			this._handleEvent('sendRawCallBack', doc.childNodes.item(i));
			continue;
		}

		this._inQ = this._inQ.concat(doc.childNodes.item(i));
		this._checkInQ();
	}
};

/**
 * @private
 * this function parses all of the features of the xmpp service that are sent during connection of the server
 * Also if an error is reported in the message it terminates the connection to the server
 * Features currently being parsed are authentication types supported and compression types supported
 */
JXMPPConnection.prototype._parseStreamFeatures = function(doc) {
	if (!doc) {
		Ti.API.error("nothing to parse ... aborting");
		return false;
	}
	var errorTag;
	if (doc.getElementsByTagNameNS) {
		errorTag = doc.getElementsByTagNameNS(Constants.NS_STREAM, "error").item(0);
	} else {
		var errors = doc.getElementsByTagName("error");
		for (var i = 0; i < errors.length; i++)
			if (errors.item(i).namespaceURI == Constants.NS_STREAM || errors.item(i).getAttribute('xmlns') == Constants.NS_STREAM) {
				errorTag = errors.item(i);
				break;
			}
	}

	if (errorTag) {
		this._setStatus("internal_server_error");
		this._handleEvent('onerror', JXMPPError.create('503', 'cancel', 'session-terminate'));
		Ti.API.error("Disconnected.");
		this._handleEvent('ondisconnect');
		this._req.close();
		return false;
	}

	this.mechs = new Object();
	var lMec1 = doc.documentElement.getElementsByTagName("mechanisms");
	var lMec3 = doc.documentElement.getElementsByTagName("starttls");
	var compress = doc.documentElement.getElementsByTagName("compression");

	if (!lMec1.length)
		return false;
	this.has_sasl = false;
	for (var i = 0; i < lMec1.length; i++) {
		if (lMec1.item(0).namespaceURI == Constants.NS_SASL && this.authtype != 'tls') {
			this.has_sasl = true;
			var lMec2 = lMec1.item(i).getElementsByTagName("mechanism");
			for (var j = 0; j < lMec2.length; j++)
				this.mechs[lMec2.item(j).firstChild.textContent] = true;
			break;
		}
		var node = Constants.NS_TLS;
		if (lMec3.item(i).namespaceURI == Constants.NS_TLS) {
			this.has_tls = true;
			var lMec2 = lMec1.item(i).getElementsByTagName("mechanism");
			for (var j = 0; j < lMec2.length; j++)
				this.mechs[lMec2.item(j).firstChild.textContent] = true;
			break;
		}
	}

	this.compTypes = new Object();

	if (compress.length) {
		for (var i = 0; i < compress.length; i++) {
			if (compress.item(0).namespaceURI == Constants.NS_FEATURE_COMPRESS) {
				var compress2 = compress.item(i).getElementsByTagName("method");
				for (var j = 0; j < compress2.length; j++)
					this.compTypes[compress2.item(j).firstChild.textContent] = true;
				break;
			}
		}
	} else {
		Ti.API.info('Compression not supported');
		this.compressionType = false;
	}

	if (this.has_tls)
		Ti.API.info("TLS detected");
	else if (this.has_sasl) {
		Ti.API.info("SASL detected");
	} else {
		Ti.API.info("No support for SASL detected");
		return true;
	}
	/* [TODO]
	 * check if in-band registration available
	 * check for session and bind features
	 */

	return true;
};

/**
 * @private
 */
JXMPPConnection.prototype._registerPID = function(pID, cb, arg) {
	if (!pID || !cb)
		return false;
	this._regIDs[pID] = new Object();
	this._regIDs[pID].cb = cb;
	if (arg)
		this._regIDs[pID].arg = arg;
	Ti.API.info("registered " + pID);
	return true;
};

/**
 * @desc This function is used to send messages to the xmpp server
 * @param {String} xml - xml message to send to the socket
 * @param {Function} cb - The function to be executed when a response is received for the last message sent
 * @fires JXMPPConnection#sendRawCallBack
 */
JXMPPConnection.prototype._sendRaw = function(xml, cb) {
	if (this._connected == false)
		return false;
	if (cb) {
		this.registerHandler('sendRawCallBack', cb);
	}
	xml = xml.replace(/&/g, '&amp;');
	Ti.API.info("Raw Send:" + xml);
	if(this._startOutboundCompression){
		var sec= zlib.deflate(xml,{level:5});
		xml= zlib.deflate(xml,{to:'string',level:5});
		try {
		var string=Ti.Utils.base64decode(sec);
		this._req.write(Ti.createBuffer({
			value:string
		}));
	} catch(e) {
		Ti.API.error(e);
		return false;
	}
	}else{
	
	try {
		this._req.write(Ti.createBuffer({
			value : xml
		}));
	} catch(e) {
		Ti.API.error('error writing to the socket: '+e);
		this.disconnect();
		return false;
	}
}
	return true;
};

/**
 * @private
 */
JXMPPConnection.prototype._setStatus = function(status) {
	if (!status || status == '')
		return;
	if (status != this._status) {// status changed!
		this._status = status;
		this._handleEvent('onstatuschanged', status);
		this._handleEvent('status_changed', status);
	}
};

/**
 * @private
 */
JXMPPConnection.prototype._unregisterPID = function(pID) {
	if (!this._regIDs[pID])
		return false;
	this._regIDs[pID] = null;
	Ti.API.info("unregistered " + pID);
	return true;
};

/**
 * @private
 * It is used to discard a message if it is too old or if it not directed to the current user registered for this instance
 * @param {String} message - message to be checked
 */
JXMPPConnection.prototype._discardMessage = function(message) {
	var initMessage = message;
	if (message.indexOf('message') < 0)
		return;
	var index = message.indexOf('id=');
	index += 4;
	message = message.substr(index, message.length);
	index = message.indexOf('"');
	message = message.substr(0, index);
	if(Titanium.Platform.name=='android'){
		//var securely = require('bencoding.securely');
		//var stringCrypto = securely.createStringCrypto();
		//var temp = stringCrypto.AESDecrypt(usingGUID,message);
		//message=temp;
		//temp=null;stringCrypto=null;securely=null;
	}
	index = message.indexOf("|") + 1;
	var checkUser = that.username.substring(1);
	if (message.substr(0, index - 1) != that.resource && message.substr(0, index - 1) != checkUser)
		return;
	message = message.substr(index, message.length);
	var date = new Date();
	message += '000';
	message = parseInt(message);
	var curr = date.getTime();
	var timeDiff = curr - message;
	timeDiff -= 130;
	if ((timeDiff / (1000 * 60)) > 1)
		return;
	that._handleMessage(initMessage);
};








/*
 **Crypt.js file placed inside this file to resolve dependecy issues upon loading the file on runtime
 * 
 */


/*
 * A JavaScript implementation of the Secure Hash Algorithm, SHA-1, as defined
 * in FIPS PUB 180-1
 * Version 2.1a Copyright Paul Johnston 2000 - 2002.
 * Other contributors: Greg Holt, Andrew Kepert, Ydnar, Lostinet
 * Distributed under the BSD License
 * See http://pajhome.org.uk/crypt/md5 for details.
 */

/*
 * Configurable variables. You may need to tweak these to be compatible with
 * the server-side, but the defaults work in most cases.
 */
var hexcase = 0;  /* hex output format. 0 - lowercase; 1 - uppercase        */
var b64pad  = "="; /* base-64 pad character. "=" for strict RFC compliance   */
var chrsz   = 8;  /* bits per input character. 8 - ASCII; 16 - Unicode      */

/*
 * These are the functions you'll usually want to call
 * They take string arguments and return either hex or base-64 encoded strings
 */
function hex_sha1(s){return binb2hex(core_sha1(str2binb(s),s.length * chrsz));}
function b64_sha1(s){return binb2b64(core_sha1(str2binb(s),s.length * chrsz));}
function str_sha1(s){return binb2str(core_sha1(str2binb(s),s.length * chrsz));}
function hex_hmac_sha1(key, data){ return binb2hex(core_hmac_sha1(key, data));}
function b64_hmac_sha1(key, data){ return binb2b64(core_hmac_sha1(key, data));}
function str_hmac_sha1(key, data){ return binb2str(core_hmac_sha1(key, data));}

/*
 * Perform a simple self-test to see if the VM is working
 */
function sha1_vm_test()
{
  return hex_sha1("abc") == "a9993e364706816aba3e25717850c26c9cd0d89d";
}

/*
 * Calculate the SHA-1 of an array of big-endian words, and a bit length
 */
function core_sha1(x, len)
{
  /* append padding */
  x[len >> 5] |= 0x80 << (24 - len % 32);
  x[((len + 64 >> 9) << 4) + 15] = len;

  var w = Array(80);
  var a =  1732584193;
  var b = -271733879;
  var c = -1732584194;
  var d =  271733878;
  var e = -1009589776;

  for(var i = 0; i < x.length; i += 16)
    {
      var olda = a;
      var oldb = b;
      var oldc = c;
      var oldd = d;
      var olde = e;

      for(var j = 0; j < 80; j++)
        {
          if(j < 16) w[j] = x[i + j];
          else w[j] = rol(w[j-3] ^ w[j-8] ^ w[j-14] ^ w[j-16], 1);
          var t = safe_add(safe_add(rol(a, 5), sha1_ft(j, b, c, d)),
                           safe_add(safe_add(e, w[j]), sha1_kt(j)));
          e = d;
          d = c;
          c = rol(b, 30);
          b = a;
          a = t;
        }

      a = safe_add(a, olda);
      b = safe_add(b, oldb);
      c = safe_add(c, oldc);
      d = safe_add(d, oldd);
      e = safe_add(e, olde);
    }
  return Array(a, b, c, d, e);

}

/*
 * Perform the appropriate triplet combination function for the current
 * iteration
 */
function sha1_ft(t, b, c, d)
{
  if(t < 20) return (b & c) | ((~b) & d);
  if(t < 40) return b ^ c ^ d;
  if(t < 60) return (b & c) | (b & d) | (c & d);
  return b ^ c ^ d;
}

/*
 * Determine the appropriate additive constant for the current iteration
 */
function sha1_kt(t)
{
  return (t < 20) ?  1518500249 : (t < 40) ?  1859775393 :
    (t < 60) ? -1894007588 : -899497514;
}

/*
 * Calculate the HMAC-SHA1 of a key and some data
 */
function core_hmac_sha1(key, data)
{
  var bkey = str2binb(key);
  if(bkey.length > 16) bkey = core_sha1(bkey, key.length * chrsz);

  var ipad = Array(16), opad = Array(16);
  for(var i = 0; i < 16; i++)
    {
      ipad[i] = bkey[i] ^ 0x36363636;
      opad[i] = bkey[i] ^ 0x5C5C5C5C;
    }

  var hash = core_sha1(ipad.concat(str2binb(data)), 512 + data.length * chrsz);
  return core_sha1(opad.concat(hash), 512 + 160);
}

/*
 * Bitwise rotate a 32-bit number to the left.
 */
function rol(num, cnt)
{
  return (num << cnt) | (num >>> (32 - cnt));
}

/*
 * Convert an 8-bit or 16-bit string to an array of big-endian words
 * In 8-bit function, characters >255 have their hi-byte silently ignored.
 */
function str2binb(str)
{
  var bin = Array();
  var mask = (1 << chrsz) - 1;
  for(var i = 0; i < str.length * chrsz; i += chrsz)
    bin[i>>5] |= (str.charCodeAt(i / chrsz) & mask) << (32 - chrsz - i%32);
  return bin;
}

/*
 * Convert an array of big-endian words to a string
 */
function binb2str(bin)
{
  var str = "";
  var mask = (1 << chrsz) - 1;
  for(var i = 0; i < bin.length * 32; i += chrsz)
    str += String.fromCharCode((bin[i>>5] >>> (32 - chrsz - i%32)) & mask);
  return str;
}

/*
 * Convert an array of big-endian words to a hex string.
 */
function binb2hex(binarray)
{
  var hex_tab = hexcase ? "0123456789ABCDEF" : "0123456789abcdef";
  var str = "";
  for(var i = 0; i < binarray.length * 4; i++)
    {
      str += hex_tab.charAt((binarray[i>>2] >> ((3 - i%4)*8+4)) & 0xF) +
        hex_tab.charAt((binarray[i>>2] >> ((3 - i%4)*8  )) & 0xF);
    }
  return str;
}

/*
 * Convert an array of big-endian words to a base-64 string
 */
function binb2b64(binarray)
{
  var tab = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  var str = "";
  for(var i = 0; i < binarray.length * 4; i += 3)
    {
      var triplet = (((binarray[i   >> 2] >> 8 * (3 -  i   %4)) & 0xFF) << 16)
        | (((binarray[i+1 >> 2] >> 8 * (3 - (i+1)%4)) & 0xFF) << 8 )
        |  ((binarray[i+2 >> 2] >> 8 * (3 - (i+2)%4)) & 0xFF);
      for(var j = 0; j < 4; j++)
        {
          if(i * 8 + j * 6 > binarray.length * 32) str += b64pad;
          else str += tab.charAt((triplet >> 6*(3-j)) & 0x3F);
        }
    }
  return str.replace(/AAA\=(\=*?)$/,'$1'); // cleans garbage chars at end of string
}

/*
 * A JavaScript implementation of the RSA Data Security, Inc. MD5 Message
 * Digest Algorithm, as defined in RFC 1321.
 * Version 2.1 Copyright (C) Paul Johnston 1999 - 2002.
 * Other contributors: Greg Holt, Andrew Kepert, Ydnar, Lostinet
 * Distributed under the BSD License
 * See http://pajhome.org.uk/crypt/md5 for more info.
 */

/*
 * Configurable variables. You may need to tweak these to be compatible with
 * the server-side, but the defaults work in most cases.
 */
// var hexcase = 0;  /* hex output format. 0 - lowercase; 1 - uppercase        */
// var b64pad  = ""; /* base-64 pad character. "=" for strict RFC compliance   */
// var chrsz   = 8;  /* bits per input character. 8 - ASCII; 16 - Unicode      */

/*
 * These are the functions you'll usually want to call
 * They take string arguments and return either hex or base-64 encoded strings
 */
function hex_md5(s){ return binl2hex(core_md5(str2binl(s), s.length * chrsz));}
function b64_md5(s){ return binl2b64(core_md5(str2binl(s), s.length * chrsz));}
function str_md5(s){ return binl2str(core_md5(str2binl(s), s.length * chrsz));}
function hex_hmac_md5(key, data) { return binl2hex(core_hmac_md5(key, data)); }
function b64_hmac_md5(key, data) { return binl2b64(core_hmac_md5(key, data)); }
function str_hmac_md5(key, data) { return binl2str(core_hmac_md5(key, data)); }

/*
 * Perform a simple self-test to see if the VM is working
 */
function md5_vm_test()
{
  return hex_md5("abc") == "900150983cd24fb0d6963f7d28e17f72";
}

/*
 * Calculate the MD5 of an array of little-endian words, and a bit length
 */
function core_md5(x, len)
{
  /* append padding */
  x[len >> 5] |= 0x80 << ((len) % 32);
  x[(((len + 64) >>> 9) << 4) + 14] = len;

  var a =  1732584193;
  var b = -271733879;
  var c = -1732584194;
  var d =  271733878;

  for(var i = 0; i < x.length; i += 16)
  {
    var olda = a;
    var oldb = b;
    var oldc = c;
    var oldd = d;

    a = md5_ff(a, b, c, d, x[i+ 0], 7 , -680876936);
    d = md5_ff(d, a, b, c, x[i+ 1], 12, -389564586);
    c = md5_ff(c, d, a, b, x[i+ 2], 17,  606105819);
    b = md5_ff(b, c, d, a, x[i+ 3], 22, -1044525330);
    a = md5_ff(a, b, c, d, x[i+ 4], 7 , -176418897);
    d = md5_ff(d, a, b, c, x[i+ 5], 12,  1200080426);
    c = md5_ff(c, d, a, b, x[i+ 6], 17, -1473231341);
    b = md5_ff(b, c, d, a, x[i+ 7], 22, -45705983);
    a = md5_ff(a, b, c, d, x[i+ 8], 7 ,  1770035416);
    d = md5_ff(d, a, b, c, x[i+ 9], 12, -1958414417);
    c = md5_ff(c, d, a, b, x[i+10], 17, -42063);
    b = md5_ff(b, c, d, a, x[i+11], 22, -1990404162);
    a = md5_ff(a, b, c, d, x[i+12], 7 ,  1804603682);
    d = md5_ff(d, a, b, c, x[i+13], 12, -40341101);
    c = md5_ff(c, d, a, b, x[i+14], 17, -1502002290);
    b = md5_ff(b, c, d, a, x[i+15], 22,  1236535329);

    a = md5_gg(a, b, c, d, x[i+ 1], 5 , -165796510);
    d = md5_gg(d, a, b, c, x[i+ 6], 9 , -1069501632);
    c = md5_gg(c, d, a, b, x[i+11], 14,  643717713);
    b = md5_gg(b, c, d, a, x[i+ 0], 20, -373897302);
    a = md5_gg(a, b, c, d, x[i+ 5], 5 , -701558691);
    d = md5_gg(d, a, b, c, x[i+10], 9 ,  38016083);
    c = md5_gg(c, d, a, b, x[i+15], 14, -660478335);
    b = md5_gg(b, c, d, a, x[i+ 4], 20, -405537848);
    a = md5_gg(a, b, c, d, x[i+ 9], 5 ,  568446438);
    d = md5_gg(d, a, b, c, x[i+14], 9 , -1019803690);
    c = md5_gg(c, d, a, b, x[i+ 3], 14, -187363961);
    b = md5_gg(b, c, d, a, x[i+ 8], 20,  1163531501);
    a = md5_gg(a, b, c, d, x[i+13], 5 , -1444681467);
    d = md5_gg(d, a, b, c, x[i+ 2], 9 , -51403784);
    c = md5_gg(c, d, a, b, x[i+ 7], 14,  1735328473);
    b = md5_gg(b, c, d, a, x[i+12], 20, -1926607734);

    a = md5_hh(a, b, c, d, x[i+ 5], 4 , -378558);
    d = md5_hh(d, a, b, c, x[i+ 8], 11, -2022574463);
    c = md5_hh(c, d, a, b, x[i+11], 16,  1839030562);
    b = md5_hh(b, c, d, a, x[i+14], 23, -35309556);
    a = md5_hh(a, b, c, d, x[i+ 1], 4 , -1530992060);
    d = md5_hh(d, a, b, c, x[i+ 4], 11,  1272893353);
    c = md5_hh(c, d, a, b, x[i+ 7], 16, -155497632);
    b = md5_hh(b, c, d, a, x[i+10], 23, -1094730640);
    a = md5_hh(a, b, c, d, x[i+13], 4 ,  681279174);
    d = md5_hh(d, a, b, c, x[i+ 0], 11, -358537222);
    c = md5_hh(c, d, a, b, x[i+ 3], 16, -722521979);
    b = md5_hh(b, c, d, a, x[i+ 6], 23,  76029189);
    a = md5_hh(a, b, c, d, x[i+ 9], 4 , -640364487);
    d = md5_hh(d, a, b, c, x[i+12], 11, -421815835);
    c = md5_hh(c, d, a, b, x[i+15], 16,  530742520);
    b = md5_hh(b, c, d, a, x[i+ 2], 23, -995338651);

    a = md5_ii(a, b, c, d, x[i+ 0], 6 , -198630844);
    d = md5_ii(d, a, b, c, x[i+ 7], 10,  1126891415);
    c = md5_ii(c, d, a, b, x[i+14], 15, -1416354905);
    b = md5_ii(b, c, d, a, x[i+ 5], 21, -57434055);
    a = md5_ii(a, b, c, d, x[i+12], 6 ,  1700485571);
    d = md5_ii(d, a, b, c, x[i+ 3], 10, -1894986606);
    c = md5_ii(c, d, a, b, x[i+10], 15, -1051523);
    b = md5_ii(b, c, d, a, x[i+ 1], 21, -2054922799);
    a = md5_ii(a, b, c, d, x[i+ 8], 6 ,  1873313359);
    d = md5_ii(d, a, b, c, x[i+15], 10, -30611744);
    c = md5_ii(c, d, a, b, x[i+ 6], 15, -1560198380);
    b = md5_ii(b, c, d, a, x[i+13], 21,  1309151649);
    a = md5_ii(a, b, c, d, x[i+ 4], 6 , -145523070);
    d = md5_ii(d, a, b, c, x[i+11], 10, -1120210379);
    c = md5_ii(c, d, a, b, x[i+ 2], 15,  718787259);
    b = md5_ii(b, c, d, a, x[i+ 9], 21, -343485551);

    a = safe_add(a, olda);
    b = safe_add(b, oldb);
    c = safe_add(c, oldc);
    d = safe_add(d, oldd);
  }
  return Array(a, b, c, d);

}

/*
 * These functions implement the four basic operations the algorithm uses.
 */
function md5_cmn(q, a, b, x, s, t)
{
  return safe_add(bit_rol(safe_add(safe_add(a, q), safe_add(x, t)), s),b);
}
function md5_ff(a, b, c, d, x, s, t)
{
  return md5_cmn((b & c) | ((~b) & d), a, b, x, s, t);
}
function md5_gg(a, b, c, d, x, s, t)
{
  return md5_cmn((b & d) | (c & (~d)), a, b, x, s, t);
}
function md5_hh(a, b, c, d, x, s, t)
{
  return md5_cmn(b ^ c ^ d, a, b, x, s, t);
}
function md5_ii(a, b, c, d, x, s, t)
{
  return md5_cmn(c ^ (b | (~d)), a, b, x, s, t);
}

/*
 * Calculate the HMAC-MD5, of a key and some data
 */
function core_hmac_md5(key, data)
{
  var bkey = str2binl(key);
  if(bkey.length > 16) bkey = core_md5(bkey, key.length * chrsz);

  var ipad = Array(16), opad = Array(16);
  for(var i = 0; i < 16; i++)
  {
    ipad[i] = bkey[i] ^ 0x36363636;
    opad[i] = bkey[i] ^ 0x5C5C5C5C;
  }

  var hash = core_md5(ipad.concat(str2binl(data)), 512 + data.length * chrsz);
  return core_md5(opad.concat(hash), 512 + 128);
}

/*
 * Add integers, wrapping at 2^32. This uses 16-bit operations internally
 * to work around bugs in some JS interpreters.
 */
function safe_add(x, y)
{
  var lsw = (x & 0xFFFF) + (y & 0xFFFF);
  var msw = (x >> 16) + (y >> 16) + (lsw >> 16);
  return (msw << 16) | (lsw & 0xFFFF);
}

/*
 * Bitwise rotate a 32-bit number to the left.
 */
function bit_rol(num, cnt)
{
  return (num << cnt) | (num >>> (32 - cnt));
}

/*
 * Convert a string to an array of little-endian words
 * If chrsz is ASCII, characters >255 have their hi-byte silently ignored.
 */
function str2binl(str)
{
  var bin = Array();
  var mask = (1 << chrsz) - 1;
  for(var i = 0; i < str.length * chrsz; i += chrsz)
    bin[i>>5] |= (str.charCodeAt(i / chrsz) & mask) << (i%32);
  return bin;
}

/*
 * Convert an array of little-endian words to a string
 */
function binl2str(bin)
{
  var str = "";
  var mask = (1 << chrsz) - 1;
  for(var i = 0; i < bin.length * 32; i += chrsz)
    str += String.fromCharCode((bin[i>>5] >>> (i % 32)) & mask);
  return str;
}

/*
 * Convert an array of little-endian words to a hex string.
 */
function binl2hex(binarray)
{
  var hex_tab = hexcase ? "0123456789ABCDEF" : "0123456789abcdef";
  var str = "";
  for(var i = 0; i < binarray.length * 4; i++)
  {
    str += hex_tab.charAt((binarray[i>>2] >> ((i%4)*8+4)) & 0xF) +
           hex_tab.charAt((binarray[i>>2] >> ((i%4)*8  )) & 0xF);
  }
  return str;
}

/*
 * Convert an array of little-endian words to a base-64 string
 */
function binl2b64(binarray)
{
  var tab = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  var str = "";
  for(var i = 0; i < binarray.length * 4; i += 3)
  {
    var triplet = (((binarray[i   >> 2] >> 8 * ( i   %4)) & 0xFF) << 16)
                | (((binarray[i+1 >> 2] >> 8 * ((i+1)%4)) & 0xFF) << 8 )
                |  ((binarray[i+2 >> 2] >> 8 * ((i+2)%4)) & 0xFF);
    for(var j = 0; j < 4; j++)
    {
      if(i * 8 + j * 6 > binarray.length * 32) str += b64pad;
      else str += tab.charAt((triplet >> 6*(3-j)) & 0x3F);
    }
  }
  return str;
}

/* #############################################################################
   UTF-8 Decoder and Encoder
   base64 Encoder and Decoder
   written by Tobias Kieslich, justdreams
   Contact: tobias@justdreams.de				http://www.justdreams.de/
   ############################################################################# */

// returns an array of byterepresenting dezimal numbers which represent the
// plaintext in an UTF-8 encoded version. Expects a string.
// This function includes an exception management for those nasty browsers like
// NN401, which returns negative decimal numbers for chars>128. I hate it!!
// This handling is unfortunately limited to the user's charset. Anyway, it works
// in most of the cases! Special signs with an unicode>256 return numbers, which
// can not be converted to the actual unicode and so not to the valid utf-8
// representation. Anyway, this function does always return values which can not
// misinterpretd by RC4 or base64 en- or decoding, because every value is >0 and
// <255!!
// Arrays are faster and easier to handle in b64 encoding or encrypting....
function utf8t2d(t)
{
  t = t.replace(/\r\n/g,"\n");
  var d=new Array; var test=String.fromCharCode(237);
  if (test.charCodeAt(0) < 0)
    for(var n=0; n<t.length; n++)
      {
        var c=t.charCodeAt(n);
        if (c>0)
          d[d.length]= c;
        else {
          d[d.length]= (((256+c)>>6)|192);
          d[d.length]= (((256+c)&63)|128);}
      }
  else
    for(var n=0; n<t.length; n++)
      {
        var c=t.charCodeAt(n);
        // all the signs of asci => 1byte
        if (c<128)
          d[d.length]= c;
        // all the signs between 127 and 2047 => 2byte
        else if((c>127) && (c<2048)) {
          d[d.length]= ((c>>6)|192);
          d[d.length]= ((c&63)|128);}
        // all the signs between 2048 and 66536 => 3byte
        else {
          d[d.length]= ((c>>12)|224);
          d[d.length]= (((c>>6)&63)|128);
          d[d.length]= ((c&63)|128);}
      }
  return d;
}
	
// returns plaintext from an array of bytesrepresenting dezimal numbers, which
// represent an UTF-8 encoded text; browser which does not understand unicode
// like NN401 will show "?"-signs instead
// expects an array of byterepresenting decimals; returns a string
function utf8d2t(d)
{
  var r=new Array; var i=0;
  while(i<d.length)
    {
      if (d[i]<128) {
        r[r.length]= String.fromCharCode(d[i]); i++;}
      else if((d[i]>191) && (d[i]<224)) {
        r[r.length]= String.fromCharCode(((d[i]&31)<<6) | (d[i+1]&63)); i+=2;}
      else {
        r[r.length]= String.fromCharCode(((d[i]&15)<<12) | ((d[i+1]&63)<<6) | (d[i+2]&63)); i+=3;}
    }
  return r.join("");
}

// included in <body onload="b64arrays"> it creates two arrays which makes base64
// en- and decoding faster
// this speed is noticeable especially when coding larger texts (>5k or so)
function b64arrays() {
  var b64s='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  b64 = new Array();f64 =new Array();
  for (var i=0; i<b64s.length ;i++) {
    b64[i] = b64s.charAt(i);
    f64[b64s.charAt(i)] = i;
  }
}

// creates a base64 encoded text out of an array of byerepresenting dezimals
// it is really base64 :) this makes serversided handling easier
// expects an array; returns a string
function b64d2t(d) {
  var r=new Array; var i=0; var dl=d.length;
  // this is for the padding
  if ((dl%3) == 1) {
    d[d.length] = 0; d[d.length] = 0;}
  if ((dl%3) == 2)
    d[d.length] = 0;
  // from here conversion
  while (i<d.length)
    {
      r[r.length] = b64[d[i]>>2];
      r[r.length] = b64[((d[i]&3)<<4) | (d[i+1]>>4)];
      r[r.length] = b64[((d[i+1]&15)<<2) | (d[i+2]>>6)];
      r[r.length] = b64[d[i+2]&63];
      i+=3;
    }
  // this is again for the padding
  if ((dl%3) == 1)
    r[r.length-1] = r[r.length-2] = "=";
  if ((dl%3) == 2)
    r[r.length-1] = "=";
  // we join the array to return a textstring
  var t=r.join("");
  return t;
}

// returns array of byterepresenting numbers created of an base64 encoded text
// it is still the slowest function in this modul; I hope I can make it faster
// expects string; returns an array
function b64t2d(t) {
  var d=new Array; var i=0;
  // here we fix this CRLF sequenz created by MS-OS; arrrgh!!!
  t=t.replace(/\n|\r/g,""); t=t.replace(/=/g,"");
  while (i<t.length)
    {
      d[d.length] = (f64[t.charAt(i)]<<2) | (f64[t.charAt(i+1)]>>4);
      d[d.length] = (((f64[t.charAt(i+1)]&15)<<4) | (f64[t.charAt(i+2)]>>2));
      d[d.length] = (((f64[t.charAt(i+2)]&3)<<6) | (f64[t.charAt(i+3)]));
      i+=4;
    }
  if (t.length%4 == 2)
    d = d.slice(0, d.length-2);
  if (t.length%4 == 3)
    d = d.slice(0, d.length-1);
  return d;
}

if (typeof(atob) == 'undefined' || typeof(btoa) == 'undefined')
  b64arrays();

if (typeof(atob) == 'undefined') {
  b64decode = function(s) {
    return utf8d2t(b64t2d(s));
  }
} else {
  b64decode = function(s) {
    return decodeURIComponent(escape(atob(s)));
  }
}

if (typeof(btoa) == 'undefined') {
  b64encode = function(s) {
    return b64d2t(utf8t2d(s));
  }
} else {
  b64encode = function(s) {
    return btoa(unescape(encodeURIComponent(s)));
  }
}

function cnonce(size) {
  var tab = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  var cnonce = '';
  for (var i=0; i<size; i++) {
    cnonce += tab.charAt(Math.round(Math.random(new Date().getTime())*(tab.length-1)));
  }
  return cnonce;
}






//this is require for the application to be registered as a background service for iOS
if(Ti.Platform.name=='android')
	module.exports = JXMPPConnection;
else
	exports = JXMPPConnection;