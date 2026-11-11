#!/usr/bin/env node
/*
 * Loads the router's client_function.js (stock + the genClientList injection)
 * with YazFi_networkmap.js appended, then renders By Interface.
 *
 *   NODE_PATH=/tmp/yazfi-nm-test/node_modules \
 *   CLIENT_FUNCTION_JS=/path/to/client_function.patched.js \
 *   node tests/networkmap_clientlist_harness.js
 */
"use strict";

var fs = require("fs");
var path = require("path");
var assert = require("assert");
var JSDOM = require("jsdom").JSDOM;

var root = path.resolve(__dirname, "..");
var clientPath = process.env.CLIENT_FUNCTION_JS ||
    "/home/ubuntu/.cursor/projects/agent-repos-YazFi/uploads/client_function.patched_009c.js";
var yazfiPath = path.join(root, "YazFi_networkmap.js");

function neutralizeAsp(source) {
    return source.replace(/<%[\s\S]*?%>/g, function (match, offset, whole) {
        var i = offset - 1;
        while (i >= 0 && /\s/.test(whole.charAt(i)))
            i--;
        var prev = i >= 0 ? whole.charAt(i) : "";
        if (prev === "'" || prev === "\"")
            return "";
        if (match.indexOf("get_clientlist") !== -1)
            return "{maclist:[]}";
        return "\"\"";
    });
}

function translateTokens(source) {
    var map = {
        "376": "Guest Network",
        "3497": "Wireless",
        "3496": "Wired",
        "1654": "Hide",
        "1655": "Show",
        "2545": "No data"
    };
    return source.replace(/<#(\d+)#>/g, function (_, n) {
        return map[n] || ("S" + n);
    });
}

function loadPage() {
    var stock = fs.readFileSync(clientPath, "utf8");
    var cut = stock.indexOf("/* YAZFI_NETWORKMAP_INJECT_V1 */");
    if (cut < 0)
        cut = stock.indexOf("function yazfiRequestClientData");
    if (cut < 0)
        throw new Error("Could not find the YazFi appendix in " + clientPath);
    stock = stock.slice(0, cut);
    if (stock.indexOf("yazfiMergeIntoOriginData();") < 0)
        throw new Error("genClientList injection is missing");
    var yazfi = fs.readFileSync(yazfiPath, "utf8");
    var source = translateTokens(neutralizeAsp(stock + "\n" + yazfi));
    var start = source.indexOf("/*");
    if (start > 0)
        source = source.slice(start);

    var dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
        url: "http://router.local/",
        pretendToBeVisual: true,
        runScripts: "outside-only"
    });
    var window = dom.window;
    var jquery = require("jquery/factory").jQueryFactory(window);
    window.$ = window.jQuery = jquery;
    window.isSupport = function (feature) {
        return feature === "amas";
    };
    window.multissid_count = 4;
    window.downsize_4m_support = false;
    window.amesh_support = false;
    window.stainfo_support = true;
    window.usericon_support = false;
    window.bwdpi_support = false;
    window.utf8_ssid_support = true;
    window.sw_mode = "1";
    window.wl_nband_title = ["2.4 GHz", "5 GHz", "6 GHz"];
    window.wanConnectStatus = true;
    window.slideFlag = false;
    window.isIE8 = false;
    window.isSwMode = function () { return false; };
    window.inet_network = function (ip) {
        var p = String(ip || "").split(".");
        if (p.length !== 4)
            return 0;
        return ((+p[0]) * 16777216) + ((+p[1]) * 65536) + ((+p[2]) * 256) + (+p[3]);
    };
    window.htmlEnDeCode = {
        htmlEncode: function (s) { return String(s); },
        htmlDecode: function (s) { return String(s); }
    };
    window.validator = {
        lengthInUtf8: function (s) { return String(s).length; },
        haveFullWidthChar: function () { return true; }
    };
    window.String.prototype.toArray = function () { return this.split(">"); };
    window.XMLHttpRequest = function () {
        this.readyState = 0;
        this.status = 0;
        this.responseText = "";
        this.open = function () {};
        this.setRequestHeader = function () {};
        this.send = function () {};
    };
    window.document.networkmapdRefresh = { submit: function () {} };
    window.eval(source);
    return window;
}

function client(opts) {
    return {
        from: "networkmapd",
        isOnline: "1",
        type: "0",
        defaultType: "0",
        ip: opts.ip,
        mac: opts.mac,
        name: opts.name,
        nickName: opts.nickName || "",
        isGateway: "0",
        isWebServer: "0",
        isPrinter: "0",
        isITunes: "0",
        dpiDevice: "",
        vendor: "",
        rssi: "-40",
        isWL: String(opts.isWL),
        isGN: (opts.isGN === undefined || opts.isGN === null || opts.isGN === "") ? "" : String(opts.isGN),
        opMode: "0",
        isLogin: "0",
        group: "",
        callback: "",
        keeparp: "0",
        ipMethod: "DHCP",
        qosLevel: "",
        wtfast: "0",
        internetMode: "allow",
        internetState: "1",
        curTx: "1",
        curRx: "1",
        wlConnectTime: "00:01:00",
        ROG: "0",
        amesh_isRe: "0"
    };
}

function originFrom(list) {
    var block = { maclist: [] };
    var i;
    for (i = 0; i < list.length; i++) {
        block.maclist.push(list[i].mac);
        block[list[i].mac] = list[i];
    }
    return { fromNetworkmapd: [block], nmpClient: [{ maclist: [] }] };
}

function headerTexts(window) {
    var block = window.document.getElementById("clientlist_viewlist_block");
    var tables, out, i, td;
    if (!block)
        return [];
    tables = block.getElementsByTagName("table");
    out = [];
    for (i = 0; i < tables.length; i++) {
        if (tables[i].className && String(tables[i].className).indexOf("FormTable_table") !== -1) {
            td = tables[i].getElementsByTagName("td")[0];
            if (td)
                out.push((td.textContent || td.innerText || "").replace(/\s+/g, " ").replace(/\s*\[ (?:Hide|Show) \]\s*$/, "").trim());
        }
    }
    return out;
}

function namesIn(window, blockId) {
    var block = window.document.getElementById(blockId);
    var nodes, out, i;
    if (!block)
        return [];
    nodes = block.getElementsByTagName("div");
    out = [];
    for (i = 0; i < nodes.length; i++) {
        if (nodes[i].className && String(nodes[i].className).indexOf("viewclientlist_clientName_edit") !== -1)
            out.push((nodes[i].textContent || "").trim());
    }
    return out;
}

function inputForMac(window, mac) {
    var inputs = window.document.getElementsByTagName("input");
    var i, onblur;
    for (i = 0; i < inputs.length; i++) {
        onblur = inputs[i].getAttribute("onblur") || "";
        if (onblur.indexOf(mac) !== -1)
            return inputs[i];
    }
    return null;
}

function pressKey(window, input, keyCode) {
    var ev = new window.KeyboardEvent("keydown", { bubbles: true, cancelable: true });
    Object.defineProperty(ev, "keyCode", { get: function () { return keyCode; } });
    Object.defineProperty(ev, "which", { get: function () { return keyCode; } });
    input.dispatchEvent(ev);
}

function render(window) {
    window.clienlistViewMode = "ByInterface";
    window.create_clientlist_listview();
    window.sorterClientList();
}

function main() {
    var window = loadPage();
    var document = window.document;
    var submits = 0;
    var content = document.createElement("div");
    var form = document.createElement("form");
    var hidden = document.createElement("input");
    var custom = "<OldPhone>72:41:73:9A:A5:25>0>0>>";
    var titles, phoneInput, amyInput;

    content.id = "clientlist_viewlist_content";
    document.body.appendChild(content);
    form.id = "view_clientlist_form";
    form.name = "view_clientlist_form";
    hidden.setAttribute("name", "custom_clientlist");
    form.appendChild(hidden);
    if (!form.custom_clientlist)
        form.custom_clientlist = hidden;
    form.submit = function () { submits++; };
    document.body.appendChild(form);

    window.view_custom_name = custom;
    window.card_client_variable.custom_clientlist = custom;
    window.yazfiCustomSnap = {};
    window.yazfiNickOverride = {};
    window.yazfiSyncCustomOverrides();

    window.yazfiSsidMap = {
        "wl0": "Socrates",
        "wl1": "Socrates-Pri",
        "wl0.1": "A<b>&\"",
        "wl1.1": "Black7_5G",
        "wl0.2": "Office"
    };
    window.yazfiClientData = [
        client({ mac: "AA:AA:AA:AA:AA:01", ip: "10.0.1.2", name: "Amy", nickName: "", isWL: 1, isGN: 1 }),
        client({ mac: "AA:AA:AA:AA:AA:02", ip: "10.0.1.3", name: "Zed", nickName: "", isWL: 1, isGN: 1 }),
        client({ mac: "72:41:73:9A:A5:25", ip: "10.0.1.4", name: "OldPhone", nickName: "OldPhone", isWL: 1, isGN: 1 }),
        client({ mac: "AA:AA:AA:AA:AA:09", ip: "10.0.2.9", name: "dhcp-host", nickName: "", isWL: 2, isGN: 1 }),
        client({ mac: "AA:AA:AA:AA:AA:10", ip: "192.168.50.10", name: "NAS", nickName: "EVIL", isWL: 1, isGN: 1 })
    ];
    window.originData = originFrom([
        client({ mac: "AA:AA:AA:AA:AA:20", ip: "192.168.1.20", name: "Desktop", nickName: "", isWL: 0, isGN: "" }),
        client({ mac: "AA:AA:AA:AA:AA:21", ip: "192.168.1.21", name: "Laptop24", nickName: "", isWL: 1, isGN: "" }),
        client({ mac: "AA:AA:AA:AA:AA:22", ip: "192.168.1.22", name: "Laptop5", nickName: "", isWL: 2, isGN: "" }),
        client({ mac: "AA:AA:AA:AA:AA:30", ip: "192.168.1.30", name: "StockGuest", nickName: "", isWL: 1, isGN: 2 }),
        client({ mac: "AA:AA:AA:AA:AA:31", ip: "192.168.1.31", name: "NoSsid", nickName: "", isWL: 2, isGN: 3 }),
        client({ mac: "AA:AA:AA:AA:AA:10", ip: "192.168.50.10", name: "nas-host", nickName: "NAS", isWL: 0, isGN: "" })
    ]);

    render(window);
    titles = headerTexts(window);
    assert.deepStrictEqual(titles.filter(function (t) { return t.indexOf("Wired") === 0; }).length, 1, "wired table: " + titles.join(" | "));
    assert.ok(titles.indexOf("Wireless · 2.4G (Socrates)") !== -1, titles.join(" | "));
    assert.ok(titles.indexOf("Wireless · 5G (Socrates-Pri)") !== -1, titles.join(" | "));
    assert.ok(titles.indexOf("Guest Network 1 · 2.4G (A<b>&\")") !== -1, titles.join(" | "));
    assert.ok(titles.indexOf("Guest Network 1 · 5G (Black7_5G)") !== -1, titles.join(" | "));
    assert.ok(titles.indexOf("Guest Network 2 · 2.4G (Office)") !== -1, titles.join(" | "));
    assert.ok(titles.indexOf("Guest Network 3 · 5G") !== -1, titles.join(" | "));
    assert.ok(titles.indexOf("Guest Network 4") === -1 && titles.every(function (t) { return t.indexOf("Guest Network 4") === -1; }), titles.join(" | "));
    assert.ok(titles.every(function (t) { return t.indexOf("6 GHz") === -1 && t.indexOf("6G") === -1; }), "empty 6G shown: " + titles.join(" | "));
    assert.ok(titles.every(function (t) { return t.indexOf("Guest Network -") === -1; }), titles.join(" | "));
    assert.ok(titles.every(function (t) { return t.indexOf("GHz") === -1; }), titles.join(" | "));
    assert.ok(titles.filter(function (t) { return t.indexOf("Wired") === 0; })[0].indexOf("·") === -1);

    var guestTd = null;
    var tds = document.getElementById("clientlist_viewlist_block").getElementsByTagName("td");
    var n;
    for (n = 0; n < tds.length; n++) {
        if ((tds[n].textContent || "").indexOf("A<b>&\"") !== -1) {
            guestTd = tds[n];
            break;
        }
    }
    assert.ok(guestTd, "escaped ssid cell");
    assert.ok(guestTd.innerHTML.indexOf("&lt;") !== -1, guestTd.innerHTML);
    assert.ok(guestTd.innerHTML.indexOf("&amp;") !== -1, guestTd.innerHTML);
    assert.ok(guestTd.innerHTML.indexOf("&quot;") !== -1, guestTd.innerHTML);

    assert.deepStrictEqual(namesIn(window, "clientlist_wired_list_Block").sort(), ["Desktop", "NAS"]);
    assert.ok(namesIn(window, "clientlist_gn1b1_list_Block").indexOf("OldPhone") !== -1);
    assert.ok(namesIn(window, "clientlist_gn1b2_list_Block").indexOf("dhcp-host") !== -1);
    assert.ok(namesIn(window, "clientlist_gn1b1_list_Block").indexOf("EVIL") === -1);

    window.sorter["sortingMethod_gn1b1"] = "increase";
    window.sorter.doSorter(2, "str", "gn1b1_list");
    var ordered = namesIn(window, "clientlist_gn1b1_list_Block");
    assert.ok(ordered.indexOf("Amy") < ordered.indexOf("Zed"), ordered.join(","));
    window.sorter["sortingMethod_gn1b1"] = "decrease";
    window.sorter.doSorter(2, "str", "gn1b1_list");
    ordered = namesIn(window, "clientlist_gn1b1_list_Block");
    assert.ok(ordered.indexOf("Zed") < ordered.indexOf("Amy"), ordered.join(","));

    var expander = document.getElementById("gn1b1_expander");
    assert.ok(expander, "expander");
    window.showHideContent("clientlist_gn1b1_list_Block", expander);
    assert.strictEqual(window.sorter.gn1b1_display, false);

    phoneInput = inputForMac(window, "72:41:73:9A:A5:25");
    assert.ok(phoneInput, "phone input");
    window.editClientName(phoneInput.id.substring("client_name_".length));
    phoneInput.value = "iPhone 15 Pro Max";
    phoneInput.focus();
    pressKey(window, phoneInput, 13);
    assert.strictEqual(submits, 1, "enter should submit once");
    assert.strictEqual(window.clientList["72:41:73:9A:A5:25"].nickName, "iPhone 15 Pro Max");
    assert.ok(window.view_custom_name.indexOf("iPhone 15 Pro Max") !== -1);
    pressKey(window, phoneInput, 13);
    assert.strictEqual(submits, 1, "second enter must not submit again");

    window.yazfiClientData = window.yazfiClientData.map(function (row) {
        if (row.mac === "72:41:73:9A:A5:25") {
            row = JSON.parse(JSON.stringify(row));
            row.name = "OldPhone";
            row.nickName = "OldPhone";
        }
        return row;
    });
    render(window);
    assert.ok(namesIn(window, "clientlist_gn1b1_list_Block").indexOf("iPhone 15 Pro Max") !== -1, namesIn(window, "clientlist_gn1b1_list_Block").join(","));
    assert.ok(namesIn(window, "clientlist_gn1b1_list_Block").indexOf("OldPhone") === -1);

    window.yazfiIngestClientPayload([
        { ssidMap: window.yazfiSsidMap },
        client({ mac: "72:41:73:9A:A5:25", ip: "10.0.1.4", name: "OldPhone", nickName: "OldPhone", isWL: 1, isGN: 1 }),
        client({ mac: "AA:AA:AA:AA:AA:01", ip: "10.0.1.2", name: "Amy", nickName: "", isWL: 1, isGN: 1 }),
        client({ mac: "AA:AA:AA:AA:AA:02", ip: "10.0.1.3", name: "Zed", nickName: "", isWL: 1, isGN: 1 }),
        client({ mac: "AA:AA:AA:AA:AA:09", ip: "10.0.2.9", name: "dhcp-host", nickName: "", isWL: 2, isGN: 1 })
    ]);
    render(window);
    assert.ok(namesIn(window, "clientlist_gn1b1_list_Block").indexOf("iPhone 15 Pro Max") !== -1);
    assert.strictEqual(window.clientList["AA:AA:AA:AA:AA:10"].nickName, "NAS");

    amyInput = inputForMac(window, "AA:AA:AA:AA:AA:01");
    window.editClientName(amyInput.id.substring("client_name_".length));
    amyInput.value = "nope";
    amyInput.focus();
    pressKey(window, amyInput, 27);
    assert.strictEqual(submits, 1, "esc must not submit");
    assert.ok(namesIn(window, "clientlist_gn1b1_list_Block").indexOf("Amy") !== -1);
    assert.ok(namesIn(window, "clientlist_gn1b1_list_Block").indexOf("nope") === -1);
    assert.strictEqual(amyInput.style.display, "none");

    window.yazfiGuestLabel = "访客网络";
    window.yazfiMainLabel = "无线";
    render(window);
    titles = headerTexts(window);
    assert.ok(titles.indexOf("无线 · 5G（Socrates-Pri）") !== -1, titles.join(" | "));
    assert.ok(titles.indexOf("访客网络 1 · 5G（Black7_5G）") !== -1, titles.join(" | "));
    assert.ok(titles.indexOf("访客网络 3 · 5G") !== -1, titles.join(" | "));
    assert.ok(titles.every(function (t) { return t.indexOf("Socrates-Pri)") === -1 || t.indexOf("（Socrates-Pri）") !== -1; }));

    window.yazfiClientData = [];
    window.yazfiGuestLabel = "Guest Network";
    window.yazfiMainLabel = "Wireless";
    render(window);
    titles = headerTexts(window);
    assert.ok(titles.indexOf("Guest Network 2 · 2.4G (Office)") !== -1, titles.join(" | "));
    assert.ok(titles.every(function (t) { return t.indexOf("Guest Network 1") === -1; }), titles.join(" | "));
    assert.ok(namesIn(window, "clientlist_wired_list_Block").indexOf("NAS") !== -1);
    assert.strictEqual(window.clientList["AA:AA:AA:AA:AA:10"].nickName, "NAS");

    window.exportClientListLog();

    var detailCalls = 0;
    window.custom_name = "<Old>AA:AA:AA:AA:AA:40>0>0>>";
    window.yazfiCustomSnap.detail = window.yazfiParseCustomClientList(window.custom_name);
    window.edit_confirm = function () {
        detailCalls++;
        window.custom_name = "<NewDetail>AA:AA:AA:AA:AA:40>0>0>>";
    };
    var macField = document.createElement("input");
    macField.id = "macaddr_field";
    macField.value = "AA:AA:AA:AA:AA:40";
    var nameField = document.createElement("input");
    nameField.id = "client_name";
    nameField.value = "NewDetail";
    document.body.appendChild(macField);
    document.body.appendChild(nameField);
    window.yazfiWrapEditConfirm();
    window.edit_confirm();
    assert.strictEqual(detailCalls, 1);
    assert.strictEqual(window.yazfiNickOverride["AA:AA:AA:AA:AA:40"], "NewDetail");

    window.yazfiSsidMap = {};
    render(window);
    titles = headerTexts(window);
    assert.ok(titles.indexOf("Wireless · 2.4G") !== -1, titles.join(" | "));
    assert.ok(titles.indexOf("Guest Network 2 · 2.4G") !== -1, titles.join(" | "));
    assert.ok(titles.every(function (t) { return t.indexOf("(") === -1 && t.indexOf("（") === -1; }), titles.join(" | "));

    console.log("networkmap client list harness: ok");
    console.log(titles.join("\n"));
}

main();
