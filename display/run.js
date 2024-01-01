/**
 * Digital Voice Modem - Host Monitor
 * GPLv2 Open Source. Use is subject to license terms.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * @package DVM / Host Monitor
 *
 */
/*
*   Copyright (C) 2022 Steven Jennison KD8RHO
*
*   This program is free software; you can redistribute it and/or modify
*   it under the terms of the GNU General Public License as published by
*   the Free Software Foundation; version 2 of the License.
*
*   This program is distributed in the hope that it will be useful,
*   but WITHOUT ANY WARRANTY; without even the implied warranty of
*   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
*   GNU General Public License for more details.
*/
// CONFIGURATION

// Location of dvmhost YML file
const ymlLocation = "/opt/dvmhost/config.yml";
// WLAN interface name
const wlaninterface = "wlan0";
// Ethernet interface name
const ethinterface = "eth0";
// VPN Interface name
const vpninterface = null;
// System name
const sysName =   "    Project.24     "


/**
 * DO NOT MODIFY BELOW THIS POINT
 */


const i2c = require('i2c-bus'),
    i2cBus = i2c.openSync(1),
    font = require('oled-font-5x7'),
    yaml = require('js-yaml'),
    fs   = require('fs'),
    readline = require('readline'),
    rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: false
    });
var oled = oled = require('oled-i2c-bus');

class BigDecimal {
    // Configuration: constants
    static DECIMALS = 18; // number of decimals on all instances
    static ROUNDED = true; // numbers are truncated (false) or rounded (true)
    static SHIFT = BigInt("1" + "0".repeat(BigDecimal.DECIMALS)); // derived constant
    constructor(value) {
        if (value instanceof BigDecimal) return value;
        let [ints, decis] = String(value).split(".").concat("");
        this._n = BigInt(ints + decis.padEnd(BigDecimal.DECIMALS, "0")
                .slice(0, BigDecimal.DECIMALS))
            + BigInt(BigDecimal.ROUNDED && decis[BigDecimal.DECIMALS] >= "5");
    }
    static fromBigInt(bigint) {
        return Object.assign(Object.create(BigDecimal.prototype), { _n: bigint });
    }
    add(num) {
        return BigDecimal.fromBigInt(this._n + new BigDecimal(num)._n);
    }
    subtract(num) {
        return BigDecimal.fromBigInt(this._n - new BigDecimal(num)._n);
    }
    static _divRound(dividend, divisor) {
        return BigDecimal.fromBigInt(dividend / divisor
            + (BigDecimal.ROUNDED ? dividend  * 2n / divisor % 2n : 0n));
    }
    multiply(num) {
        return BigDecimal._divRound(this._n * new BigDecimal(num)._n, BigDecimal.SHIFT);
    }
    divide(num) {
        return BigDecimal._divRound(this._n * BigDecimal.SHIFT, new BigDecimal(num)._n);
    }
    toString() {
        const s = this._n.toString().padStart(BigDecimal.DECIMALS+1, "0");
        return s.slice(0, -BigDecimal.DECIMALS) + "." + s.slice(-BigDecimal.DECIMALS)
            .replace(/\.?0+$/, "");
    }
}

rl.on('line', function(line){
    console.log("DVMHOST:" + line);
    // [I: 2022-02-27 23:01:17.598    RX Frequency: 900974976Hz]
    if(line.includes("    RX Frequency: "))
    {
        // [I: 2022-02-27 23:01:17.598    RX Frequency: 900974976Hz]
        let frq = line.replace(/.*RX Frequency: /g,"");
        // [900974976]
        frq = frq.replace("Hz","");
        // in Hz
        // Round to clean up dvmhost interpretation
        let tempNum = Math.round(frq/1000);
        // Make bigdec
        let frequency = new BigDecimal(tempNum);
        // Divide by 1000 to get mhz
        frequency = frequency.divide(1000);
        rxFrq = "   R:"+frequency.toString()+"mhz";
    }
    if(line.includes("    TX Frequency: "))
    {
        // [900974976Hz]
        let frq = line.replace(/.*TX Frequency: /g,"");
        // [900974976]
        frq = frq.replace("Hz","");
        // in Hz
        // Round to clean up dvmhost interpretation
        let tempNum = Math.round(frq/1000);
        // Make bigdec
        let frequency = new BigDecimal(tempNum);
        // Divide by 1000 to get mhz
        frequency = frequency.divide(1000);
        txFrq = "   T:"+frequency.toString()+"mhz";
    }
    if(line.includes("(HOST) Host is up and running"))
    {
        controlStatus = true;
        rptStatus = true;
    }
    if(line.includes("(NET) Connection to the master has timed out, retrying connection"))
    {
        LNK = false;
    }
    if(line.includes("(NET) Logged into the master successfully"))
    {
        LNK = true;
    }
    if(line.includes("P25 RF unit registration request from"))
    {
        var reg = line.replace(/.*from /g,"");
        alertLn = centerLine(`R:${reg}`)
    }
    if(line.includes("P25 RF group affiliation request from "))
    {
        // 121501 to TG  50101
        let data = line.replace(/.*from /g,"").split("to");
        let unit = data[0].trim();
        let tg = "TG"+data[1].replace("TG ","").trim();
        alertLn = centerLine(`A:${unit}>${tg}`);
    }
    if(line.includes("P25 RF group grant request from "))
    {
        // 121501 to TG  50101
        let data = line.replace(/.*from /g,"").split("to");
        let unit = data[0].trim();
        let tg = "TG"+data[1].replace("TG ","").trim();
        alertLn = centerLine(`C:${unit}>${tg}`);
    }
    if(line.includes("P25 Net network voice transmission from "))
    {
        // 121501 to TG  50101
        let data = line.replace(/.*from /g,"").split("to");
        let unit = data[0].trim();
        let tg = "TG"+data[1].replace("TG ","").trim();
        alertLn = centerLine(`NC:${unit}>${tg}`);
    }
})








var opts = {
    width: 128,
    height: 64,
    address: 0x3C
};

oled = new oled(i2cBus, opts);
var statusLn1 = "NET:OK LNK:!! CC:!!"
var statusLn2 =[
    "     OFFLINE       ", // [   CC lcn 00-0000  ]
    "     OFFLINE       ", // [   MODE: P25T-CC   ]
    "     OFFLINE       ", // [   T:123.456mhz    ]
    "     OFFLINE       ", // [     R:123.456     ]
    "WLAN OFFLINE       ", // [WL:111.111.111.111 ]
    "ETH OFFLINE        ", // [ET:111.111.111.111 ]
    "VPN OFFLINE        "  // [VP:111.111.111.111 ]
]
var alertLn =   "                   ";

var siteName =  ""
var rxFrq = "";
var txFrq = "";
var NET = false;
var LNK = false;
var control = false;
var controlStatus = false;
var rptStatus = false;


function getConfigData()
{
    try {
        const doc = yaml.load(fs.readFileSync(ymlLocation, 'utf8'));
        return doc;
    } catch (e) {
        console.log(e);
    }
}

var statusLineCurrent = 0
// Update Status Line
setInterval(()=>{
    var newLine = "";
    newLine+="NET:";
    if(NET)
    {
        newLine+="OK";
    }
    else
    {
        newLine+="!!";
    }
    newLine+=" LNK:";
    if(LNK)
    {
        newLine+="OK";
    }
    else
    {
        newLine+="!!";
    }
    if(control)
    {
        newLine+=" CC:";
        if(controlStatus)
        {
            newLine+="OK";
        }
        else
        {
            newLine+="!!";
        }
    }
    else
    {
        newLine+=" RPT:";
        if(rptStatus)
        {
            newLine+="OK";
        }
        else
        {
            newLine+="!!";
        }
    }
    statusLn1 = newLine;
},1000)

function centerLine(name)
{
    while(name.length<19)
    {
        name = " "+name;
        if(name.length<19)
        {
            name=name+" ";
        }
    }
    return name;
}

// Update LCN/Mode
setInterval(()=>{
    let config = getConfigData();
    let mode = "";
    let status = "";
    if(config.protocols.p25.enable && config.protocols.p25.control.enable && config.protocols.p25.control.dedicated)
    {
        mode = "   MODE: P25T-CC   ";
        status = `   CC LCN ${config.system.config.channelId}-${config.system.config.channelNo}  `;
        control = true;
    }
    else if(config.protocols.dmr.enable && config.protocols.dmr.control.enable && config.protocols.dmr.control.dedicated)
    {
        mode = "   MODE: DMRT-CC   ";
        status = `   CC LCN ${config.system.config.channelId}-${config.system.config.channelNo}  `;
        control = true;
    }
    else if(config.protocols.p25.enable && config.protocols.dmr.enable)
    {
        mode = " MODE: DMR/P25 VC  ";
        status = `   VC LCN ${config.system.config.channelId}-${config.system.config.channelNo}  `;
    }
    else if(config.protocols.p25.enable)
    {
        mode = "   MODE: P25 VC    ";
        status = `   VC LCN ${config.system.config.channelId}-${config.system.config.channelNo}  `;
    }
    else if(config.protocols.dmr.enable)
    {
        mode = "   MODE: P25 VC    ";
        status = `   VC LCN ${config.system.config.channelId}-${config.system.config.channelNo}  `;
    }
    statusLn2[0] = status;
    statusLn2[1] = mode;
    statusLn2[2] = txFrq;
    statusLn2[3] = rxFrq;
    siteName = centerLine(`${config.system.config.rfssId}-${config.system.config.siteId} ${config.system.identity}`);
},5000)

// Update IP info
setInterval(()=>{
    const { networkInterfaces } = require('os');

    const nets = networkInterfaces();
    const results = Object.create(null); // Or just '{}', an empty object

    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
            if (net.family === 'IPv4' && !net.internal) {
                if (!results[name]) {
                    results[name] = [];
                }
                results[name].push(net.address);
            }
        }
    }
    if(wlaninterface==null)
    {
        statusLn2[4] = "WLAN DISABLED";
    }
    else
    {
        statusLn2[4] = `WL: OFFLINE`;
        try{
            if(results[wlaninterface]!==undefined && results[wlaninterface].length>0) {
                statusLn2[4] = `WL: ${results[wlaninterface][0]}`;
            }
        }
        catch {
            //
        }

    }
    if(ethinterface==null)
    {
        statusLn2[5] = "ETH DISABLED";
    }
    else
    {
        statusLn2[5] = `ET: OFFLINE`;
        try{
            if(results[ethinterface]!==undefined && results[ethinterface].length>0) {
                statusLn2[5] = `ET: ${results[ethinterface][0]}`;
            }
        }
        catch {
            //
        }
    }
    if(vpninterface==null)
    {
        statusLn2[6] = "VPN DISABLED";
    }
    else
    {
        statusLn2[6] = `VP: OFFLINE`;
        try{
            if(results[vpninterface]!==undefined && results[vpninterface].length>0) {
                statusLn2[6] = `VP: ${results[vpninterface][0]}`;
            }
        }
        catch {
            //
        }
    }
    require('dns').resolve('www.google.com', function(err) {
        if (err) {
            NET=false;
        } else {
            NET=true;
        }
    });
})

let inversion = 0;
let inverted = false;

setInterval(()=>{
    inversion++;
    if(inversion === 4)
    {
        inversion = 0;
        inverted = !inverted;
        oled.invertDisplay(inverted);
    }
    var status = "";
    if(statusLineCurrent>statusLn2.length-1)
    {
        statusLineCurrent = 0;
    }
    if(alertLn.length>0)
    {
        status = statusLn2[statusLineCurrent];
    }
    statusLineCurrent++;
    oled.clearDisplay();
    oled.setCursor(1,1);
    oled.writeString(font, 1, `${statusLn1}`,1,false);
    oled.drawLine(1, 8, 128, 8, 1);
    oled.setCursor(1, 10);
    oled.writeString(font, 1, `${status}`, 1, false);
    oled.setCursor(1, 20);
    oled.writeString(font, 1, `${alertLn}`, 1, false);
    oled.setCursor(1, 30);
    oled.writeString(font, 1, `${sysName}`, 1, false);
    oled.setCursor(1, 40);
    oled.writeString(font, 1, `${siteName}`, 1, false);
    oled.setCursor(1, 50);
    oled.writeString(font, 1, 'DVMProject Repeater', 1, false);
},1000)
