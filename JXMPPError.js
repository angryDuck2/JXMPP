var Constants=require("UserClass/xmppConnect/xmpp1/JXMPPConstants");
var XmlDocument = require('UserClass/xmppConnect/xmpp1/JXMPPXmlDocument');
/**
 * an error packet for internal use
 * @private
 * @constructor
 * @memberof module:JXMPP
 */

module.exports={JXMPPError:function(){},create:function (code,type,condition) {
  var xmldoc = XmlDocument.create("error","JXMPP");

  xmldoc.documentElement.setAttribute('code',code);
  xmldoc.documentElement.setAttribute('type',type);
  if (condition)
    xmldoc.documentElement.appendChild(xmldoc.createElement(condition)).
      setAttribute('xmlns', Constants.NS_STANZAS);
  return xmldoc.documentElement;
}};