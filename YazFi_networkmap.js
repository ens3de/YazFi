/**----------------------------**/
/** Last Modified: 2026-Nov-11 **/
/**----------------------------**/

/* YAZFI_NETWORKMAP_INJECT_V1 */
var yazfiClientData = [];
var yazfiClientDataTime = 0;
var yazfiClientRequestActive = false;
var yazfiClientRebuildActive = false;
var yazfiSsidMap = {};
/* mac -> name the user just saved in this page. Beats a stale JSON nickName. */
var yazfiNickOverride = {};
var yazfiCustomSnap = {};
var yazfiNameSaveSuppress = false;
var yazfiNameSaveDepth = 0;
/*
 * <#376#> Guest Network / 访客网络, <#3497#> Wireless / 无线.
 * httpd substitutes these before the browser runs the script.
 */
var yazfiGuestLabel = "<#376#>";
var yazfiMainLabel = "<#3497#>";
var yazfiWlTitleToIsWL = {
    "2.4 GHz": "1",
    "5 GHz": "2",
    "5 GHz-1": "2",
    "5 GHz-2": "3",
    "6 GHz": "4"
};

function yazfiRequestClientData(force)
{
    var now = new Date().getTime();

    if (yazfiClientRequestActive)
        return;

    if (!force && (now - yazfiClientDataTime) < 5000)
        return;

    yazfiClientRequestActive = true;

    try {
        var xhr = new XMLHttpRequest();
        xhr.onreadystatechange = function() {
            if (xhr.readyState !== 4)
                return;

            yazfiClientRequestActive = false;
            yazfiClientDataTime = new Date().getTime();

            if (xhr.status === 200 || xhr.status === 0)
            {
                try {
                    var parsed = JSON.parse(xhr.responseText);
                    yazfiIngestClientPayload(parsed);
                }
                catch (e) {
                    yazfiClientData = [];
                }
            }

            /* Rebuild once after fresh guest data arrives. */
            if (!yazfiClientRebuildActive && typeof genClientList === "function")
            {
                yazfiClientRebuildActive = true;
                try {
                    genClientList();
                    if (typeof show_client_status === "function")
                        show_client_status(totalClientNum.online);
                }
                catch (e2) {}
                yazfiClientRebuildActive = false;
            }
        };
        xhr.open("GET", "/ext/YazFi/networkmap_clients.json?_=" + now, true);
        xhr.setRequestHeader("Cache-Control", "no-cache");
        xhr.send(null);
    }
    catch (e) {
        yazfiClientRequestActive = false;
    }
}

function yazfiIngestClientPayload(parsed)
{
    var clients = [];
    var nextMap = {};
    var i, item, iface;

    if (!parsed || typeof parsed.length === "undefined")
    {
        yazfiClientData = [];
        return;
    }

    for (i = 0; i < parsed.length; i++)
    {
        item = parsed[i];
        if (item && item.ssidMap && typeof item.ssidMap === "object")
        {
            for (iface in item.ssidMap)
            {
                if (!Object.prototype.hasOwnProperty.call(item.ssidMap, iface))
                    continue;
                if (item.ssidMap[iface])
                    nextMap[String(iface)] = String(item.ssidMap[iface]);
            }
            continue;
        }
        clients.push(item);
        if (item && item.iface && item.ssid)
            nextMap[String(item.iface)] = String(item.ssid);
    }

    yazfiSsidMap = nextMap;
    yazfiClientData = clients;
}

function yazfiFallbackSourceClient()
{
    return {
        from: "networkmapd",
        isOnline: "1",
        type: "0",
        defaultType: "0",
        ip: "",
        ip6: "",
        ip6_prefix: "",
        mac: "",
        name: "",
        nickName: "",
        isGateway: "0",
        isWebServer: "0",
        isPrinter: "0",
        isITunes: "0",
        dpiDevice: "",
        vendor: "",
        rssi: "-99",
        isWL: "1",
        isGN: "1",
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
        curTx: "",
        curRx: "",
        wlConnectTime: "00:00:00",
        ROG: "0"
    };
}

function yazfiIsArray(value)
{
    return Object.prototype.toString.call(value) === "[object Array]";
}

/* custom_clientlist: repeated "<name>MAC>flag>type>>". Last non-empty name wins. */
function yazfiParseCustomClientList(raw)
{
    var map = {};
    var text = "";
    var parts, i, fields, mac, name;

    if (raw == null)
        return map;
    if (typeof raw === "string")
        text = raw;
    else if (yazfiIsArray(raw))
        text = raw.join("<");
    else
        return map;

    parts = text.split("<");
    for (i = 0; i < parts.length; i++)
    {
        if (!parts[i])
            continue;
        fields = parts[i].split(">");
        if (fields.length < 2 || !fields[0])
            continue;
        name = fields[0];
        mac = String(fields[1] || "").replace(/[\r\n]/g, "").toUpperCase();
        if (!mac)
            continue;
        map[mac] = name;
    }
    return map;
}

function yazfiCustomSources()
{
    var sources = [];

    if (typeof view_custom_name === "string")
        sources.push({ key: "view", raw: view_custom_name });
    if (typeof card_client_variable !== "undefined" && card_client_variable &&
        typeof card_client_variable.custom_clientlist === "string")
        sources.push({ key: "card", raw: card_client_variable.custom_clientlist });
    if (typeof custom_name === "string")
        sources.push({ key: "detail", raw: custom_name });
    if (typeof originData !== "undefined" && originData &&
        typeof originData.customList !== "undefined")
        sources.push({ key: "origin", raw: originData.customList });
    return sources;
}

/* First sight of a source is the page-load snapshot, not an edit. */
function yazfiSyncCustomOverrides()
{
    var sources = yazfiCustomSources();
    var s, map, prev, mac;

    for (s = 0; s < sources.length; s++)
    {
        map = yazfiParseCustomClientList(sources[s].raw);
        prev = yazfiCustomSnap[sources[s].key];
        if (!prev)
        {
            yazfiCustomSnap[sources[s].key] = map;
            continue;
        }
        for (mac in map)
        {
            if (!Object.prototype.hasOwnProperty.call(map, mac))
                continue;
            if (prev[mac] !== map[mac])
                yazfiNickOverride[mac] = map[mac];
        }
        yazfiCustomSnap[sources[s].key] = map;
    }
}

function yazfiAgreedCustomName(mac)
{
    var sources = yazfiCustomSources();
    var found = "";
    var saw = false;
    var i, map, name;

    for (i = 0; i < sources.length; i++)
    {
        map = yazfiParseCustomClientList(sources[i].raw);
        if (!Object.prototype.hasOwnProperty.call(map, mac))
            continue;
        name = map[mac];
        if (!saw)
        {
            found = name;
            saw = true;
        }
        else if (found !== name)
            return "";
    }
    return saw ? found : "";
}

function yazfiApplyNickToLive(mac, name)
{
    var block;

    if (typeof clientList !== "undefined" && clientList && clientList[mac])
    {
        clientList[mac].name = name;
        clientList[mac].nickName = name;
    }
    try {
        block = originData && originData.fromNetworkmapd && originData.fromNetworkmapd[0];
        if (block && block[mac] && block[mac]._yazfiInjected === "1")
        {
            block[mac].name = name;
            block[mac].nickName = name;
        }
    }
    catch (e) {}
}

function yazfiPatchCachedGuest(mac, name)
{
    var i;

    for (i = 0; i < yazfiClientData.length; i++)
    {
        if (!yazfiClientData[i] || !yazfiClientData[i].mac)
            continue;
        if (String(yazfiClientData[i].mac).toUpperCase() !== mac)
            continue;
        yazfiClientData[i].name = name;
        yazfiClientData[i].nickName = name;
    }
}

function yazfiRememberNick(mac, name)
{
    mac = String(mac || "").toUpperCase();
    name = String(name || "").replace(/^\s+|\s+$/g, "");
    if (!mac || !name)
        return;
    yazfiNickOverride[mac] = name;
    yazfiApplyNickToLive(mac, name);
    yazfiPatchCachedGuest(mac, name);
}

/*
 * Just-saved customList name wins over networkmap_clients.json.
 * When every in-page custom list agrees, that name also wins, so a stale
 * injected nickName cannot cover a name the page already has.
 * Returns "" when the caller should keep the JSON name.
 */
function yazfiPickNick(mac, guest)
{
    var jsonNick = (guest && guest.nickName) ? String(guest.nickName) : "";
    var saved = yazfiNickOverride[mac];
    var agreed;

    if (saved)
    {
        if (jsonNick === saved)
            delete yazfiNickOverride[mac];
        return saved;
    }
    agreed = yazfiAgreedCustomName(mac);
    if (agreed)
        return agreed;
    return "";
}

function yazfiMergeIntoOriginData()
{
    try {
        if (typeof originData === "undefined" ||
            !originData.fromNetworkmapd ||
            !originData.fromNetworkmapd[0])
        {
            yazfiRequestClientData(false);
            return;
        }

        var block = originData.fromNetworkmapd[0];
        if (!block.maclist || typeof block.maclist.length === "undefined")
            block.maclist = [];

        var i, key, seed = null;

        yazfiSyncCustomOverrides();

        /* Remove clients inserted during the previous rebuild. */
        for (i = block.maclist.length - 1; i >= 0; i--)
        {
            key = block.maclist[i];
            if (block[key] && block[key]._yazfiInjected === "1")
            {
                delete block[key];
                block.maclist.splice(i, 1);
            }
        }

        for (i = 0; i < block.maclist.length; i++)
        {
            key = block.maclist[i];
            if (block[key] && typeof block[key] === "object")
            {
                seed = block[key];
                break;
            }
        }

        for (i = 0; i < yazfiClientData.length; i++)
        {
            var guest = yazfiClientData[i];
            if (!guest || !guest.mac || !guest.ip)
                continue;

            var mac = String(guest.mac).toUpperCase();
            var j, obj, exists = false;

            for (j = 0; j < block.maclist.length; j++)
            {
                if (String(block.maclist[j]).toUpperCase() === mac)
                {
                    exists = true;
                    break;
                }
            }

            /* Never replace a real ASUS/networkmap entry. */
            if (exists || (block[mac] && block[mac]._yazfiInjected !== "1"))
                continue;

            try {
                obj = seed ? JSON.parse(JSON.stringify(seed)) : yazfiFallbackSourceClient();
            }
            catch (cloneError) {
                obj = yazfiFallbackSourceClient();
            }

            obj.from = "networkmapd";
            obj.mac = mac;
            obj.ip = String(guest.ip);
            obj.ip6 = "";
            obj.ip6_prefix = "";
            obj.isOnline = "1";
            obj.isWL = String(guest.isWL || "1");
            obj.isGN = String(guest.isGN || "1");
            obj.rssi = String(guest.rssi || "-99");
            obj.type = "0";
            obj.defaultType = "0";
            obj.isGateway = "0";
            obj.isWebServer = "0";
            obj.isPrinter = "0";
            obj.isITunes = "0";
            obj.dpiDevice = "";
            obj.vendor = "";
            obj.opMode = "0";
            obj.isLogin = "0";
            obj.group = "";
            obj.callback = "";
            obj.keeparp = "0";
            obj.ipMethod = "DHCP";
            obj.qosLevel = "";
            obj.wtfast = "0";
            obj.internetMode = "allow";
            obj.internetState = "1";
            obj.ROG = "0";

            obj.curTx = (guest.curTx !== undefined && guest.curTx !== null)
                ? String(guest.curTx)
                : "";

            obj.curRx = (guest.curRx !== undefined && guest.curRx !== null)
                ? String(guest.curRx)
                : "";

            obj.wlConnectTime = guest.wlConnectTime
                ? String(guest.wlConnectTime)
                : "00:00:00";

            obj.amesh_isRe = "0";
            obj.amesh_isReClient = "0";
            obj.amesh_papMac = "";
            obj.amesh_bind_mac = "";
            obj.amesh_bind_band = "0";
            obj._yazfiInjected = "1";

            var chosen = yazfiPickNick(mac, guest);
            if (chosen)
            {
                obj.name = chosen;
                obj.nickName = chosen;
            }
            else
            {
                obj.name = guest.name ? String(guest.name) : mac;
                /* Custom names arrive in nickName; leave it empty when the client has none. */
                obj.nickName = guest.nickName ? String(guest.nickName) : "";
            }

            block.maclist.push(mac);
            block[mac] = obj;
        }

        yazfiRequestClientData(false);
    }
    catch (e) {
        yazfiRequestClientData(false);
    }
}

function yazfiHtmlEscape(text)
{
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function yazfiUiIsChinese()
{
    return /[\u3400-\u9fff]/.test(String(yazfiGuestLabel)) ||
        /[\u3400-\u9fff]/.test(String(yazfiMainLabel));
}

function yazfiSsidSuffix(ssid)
{
    var safe;

    if (!ssid)
        return "";
    safe = yazfiHtmlEscape(ssid);
    if (yazfiUiIsChinese())
        return "\uFF08" + safe + "\uFF09";
    return " (" + safe + ")";
}

function yazfiBandText(isWL)
{
    var item = (typeof isWL_map !== "undefined") ? (isWL_map[String(isWL)] || isWL_map[isWL]) : null;

    if (item && item.text)
        return String(item.text);
    return "";
}

function yazfiIfaceFor(isWL, isGN)
{
    var radio = parseInt(isWL, 10) - 1;
    var iface, gn;

    if (isNaN(radio) || radio < 0)
        return "";
    iface = "wl" + radio;
    if (isGN !== "" && isGN != null && String(isGN) !== "0")
    {
        gn = parseInt(isGN, 10);
        if (!isNaN(gn) && gn > 0)
            iface += "." + gn;
    }
    return iface;
}

function yazfiLookupSsid(isWL, isGN)
{
    var iface = yazfiIfaceFor(isWL, isGN);
    var pageValue;

    if (!iface)
        return "";
    if (yazfiSsidMap[iface])
        return String(yazfiSsidMap[iface]);
    try {
        pageValue = window[iface + "_ssid"];
        if (pageValue)
            return String(pageValue);
    }
    catch (e) {}
    return "";
}

function yazfiGuestTitle(isGN, isWL, ssid)
{
    var band = yazfiBandText(isWL);

    return yazfiGuestLabel + " " + isGN + " \u00B7 " + band + yazfiSsidSuffix(ssid);
}

function yazfiMainTitle(isWL, ssid)
{
    var band = yazfiBandText(isWL);

    return yazfiMainLabel + " \u00B7 " + band + yazfiSsidSuffix(ssid);
}

function yazfiIsBandBucket(key)
{
    return /^gn\d+b\d+$/.test(String(key || ""));
}

function yazfiListKey(arrayName)
{
    var name = String(arrayName || "");

    if (name.length > 5 && name.substring(name.length - 5) === "_list")
        return name.substring(0, name.length - 5);
    return name;
}

function yazfiBucketParts(key)
{
    var match = /^gn(\d+)b(\d+)$/.exec(String(key || ""));

    if (!match)
        return null;
    return { isGN: match[1], isWL: match[2] };
}

function yazfiClearBuckets()
{
    var keys = [];
    var k, i;

    if (typeof gn_list === "undefined" || !gn_list)
        return;
    for (k in gn_list)
    {
        if (Object.prototype.hasOwnProperty.call(gn_list, k) && yazfiIsBandBucket(k))
            keys.push(k);
    }
    for (i = 0; i < keys.length; i++)
        delete gn_list[keys[i]];
}

function yazfiRemoveSection(blockId)
{
    var block = document.getElementById(blockId);
    var prev;

    if (!block || !block.parentNode)
        return;
    prev = block.previousSibling;
    while (prev && prev.nodeType !== 1)
        prev = prev.previousSibling;
    if (prev && prev.tagName && String(prev.tagName).toLowerCase() === "table")
        prev.parentNode.removeChild(prev);
    if (block.parentNode)
        block.parentNode.removeChild(block);
}

function yazfiFindExpander(table)
{
    var links, i;

    if (!table || !table.getElementsByTagName)
        return null;
    links = table.getElementsByTagName("a");
    for (i = 0; i < links.length; i++)
    {
        if (links[i].className && String(links[i].className).indexOf("clientlist_expander") !== -1)
            return links[i];
    }
    return null;
}

function yazfiApplyTitle(table, titleHtml)
{
    var expander = yazfiFindExpander(table);
    var parent;

    if (!expander || !expander.parentNode)
        return;
    parent = expander.parentNode;
    parent.innerHTML = titleHtml + expander.outerHTML;
}

function yazfiExportAnchor(parent)
{
    var inputs, i, node, onclick;

    if (!parent || !parent.getElementsByTagName)
        return null;
    inputs = parent.getElementsByTagName("input");
    for (i = 0; i < inputs.length; i++)
    {
        onclick = inputs[i].getAttribute("onclick") || "";
        if (onclick.indexOf("exportClientListLog") === -1)
            continue;
        node = inputs[i];
        while (node && node.parentNode !== parent)
            node = node.parentNode;
        return node;
    }
    return null;
}

function yazfiRetargetGuestClone(table, srcIndex, key)
{
    var html = table.innerHTML;
    var from = "gn" + srcIndex + "_";

    table.innerHTML = html.split(from).join(key + "_");
}

function yazfiEnsureBucketSorter(key, isGN)
{
    var base = "gn" + isGN;

    if (sorter[key + "_index"] == null)
        sorter[key + "_index"] = (sorter[base + "_index"] != null) ? sorter[base + "_index"] : 3;
    if (!sorter["sortingMethod_" + key])
        sorter["sortingMethod_" + key] = sorter["sortingMethod_" + base] || "increase";
    if (sorter[key + "_display"] == null)
        sorter[key + "_display"] = true;
}

function yazfiRebuildGuestTables()
{
    var buckets = {};
    var order = [];
    var gnCount, i, rows, r, row, isWL, isGN, key, parts;
    var srcIndex, srcBlock, srcTable, table, block, ssid, title, piece;
    var pieces = [];
    var parent = null;
    var exportNode, expander;

    if (typeof gn_list === "undefined" || typeof multissid_count === "undefined")
        return;
    gnCount = parseInt(multissid_count, 10) || 0;

    for (i = 1; i <= gnCount; i++)
    {
        rows = gn_list["gn" + i] || [];
        for (r = 0; r < rows.length; r++)
        {
            row = rows[r];
            isWL = row[9];
            isGN = row[13];
            if (isGN === "" || isGN == null)
                isGN = i;
            key = "gn" + isGN + "b" + isWL;
            if (!buckets[key])
            {
                buckets[key] = [];
                order.push(key);
                gn_list[key] = buckets[key];
                yazfiEnsureBucketSorter(key, isGN);
            }
            buckets[key].push(row);
        }
        gn_list["gn" + i] = [];
    }

    order.sort(function(a, b) {
        var pa = yazfiBucketParts(a);
        var pb = yazfiBucketParts(b);

        if (parseInt(pa.isGN, 10) !== parseInt(pb.isGN, 10))
            return parseInt(pa.isGN, 10) - parseInt(pb.isGN, 10);
        return parseInt(pa.isWL, 10) - parseInt(pb.isWL, 10);
    });

    for (i = 0; i < order.length; i++)
    {
        key = order[i];
        parts = yazfiBucketParts(key);
        srcIndex = parts.isGN;
        srcBlock = document.getElementById("clientlist_gn" + srcIndex + "_list_Block");
        if (!srcBlock)
        {
            srcBlock = document.getElementById("clientlist_gn1_list_Block");
            srcIndex = "1";
        }
        if (!srcBlock)
            continue;
        srcTable = srcBlock.previousSibling;
        while (srcTable && srcTable.nodeType !== 1)
            srcTable = srcTable.previousSibling;
        if (!srcTable)
            continue;
        if (!parent)
            parent = srcBlock.parentNode;
        table = srcTable.cloneNode(true);
        block = document.createElement("div");
        block.id = "clientlist_" + key + "_list_Block";
        yazfiRetargetGuestClone(table, srcIndex, key);
        ssid = yazfiLookupSsid(parts.isWL, parts.isGN);
        title = yazfiGuestTitle(parts.isGN, parts.isWL, ssid);
        yazfiApplyTitle(table, title);
        if (sorter[key + "_display"] === false)
        {
            block.style.display = "none";
            expander = yazfiFindExpander(table);
            if (expander)
                expander.innerHTML = "[ <#1655#> ]";
        }
        pieces.push({ table: table, block: block });
    }

    for (i = 1; i <= gnCount; i++)
        yazfiRemoveSection("clientlist_gn" + i + "_list_Block");

    if (!parent || !pieces.length)
        return;
    exportNode = yazfiExportAnchor(parent);
    for (i = 0; i < pieces.length; i++)
    {
        piece = pieces[i];
        if (exportNode)
        {
            parent.insertBefore(piece.table, exportNode);
            parent.insertBefore(piece.block, exportNode);
        }
        else
        {
            parent.appendChild(piece.table);
            parent.appendChild(piece.block);
        }
    }
}

function yazfiHideEmptyBands()
{
    var index, list;

    if (typeof isWL_map === "undefined")
        return;
    for (index in isWL_map)
    {
        if (!Object.prototype.hasOwnProperty.call(isWL_map, index))
            continue;
        if (index === "0")
        {
            list = (typeof wired_list !== "undefined") ? wired_list : [];
            if (!list || !list.length)
                yazfiRemoveSection("clientlist_wired_list_Block");
        }
        else
        {
            list = (typeof wl_list !== "undefined") ? wl_list["wl" + index] : null;
            if (!list || !list.length)
                yazfiRemoveSection("clientlist_wl" + index + "_list_Block");
        }
    }
}

function yazfiRetitleMainBands()
{
    var i, title, isWL, anchor, ssid, text, table;

    if (typeof wl_nband_title === "undefined" || !wl_nband_title)
        return;
    for (i = 0; i < wl_nband_title.length; i++)
    {
        title = wl_nband_title[i];
        isWL = yazfiWlTitleToIsWL[title];
        if (!isWL)
            continue;
        anchor = document.getElementById("wl" + isWL + "_expander");
        if (!anchor)
            continue;
        table = yazfiTableOf(anchor);
        if (!table)
            continue;
        ssid = yazfiLookupSsid(isWL, "");
        text = yazfiMainTitle(isWL, ssid);
        if (!text)
            continue;
        yazfiApplyTitle(table, text);
    }
}

function yazfiTableOf(node)
{
    var current = node;

    while (current && current.tagName && String(current.tagName).toLowerCase() !== "table")
        current = current.parentNode;
    return current;
}

function yazfiDecorateByInterface()
{
    if (typeof isSupport === "function" && isSupport("amas") &&
        typeof gn_list !== "undefined" && typeof multissid_count !== "undefined")
        yazfiRebuildGuestTables();
    yazfiHideEmptyBands();
    yazfiRetitleMainBands();
}

function yazfiExpandInterfaceFlags()
{
    var index, k;

    if (typeof sorter === "undefined")
        return;
    sorter.all_display = true;
    sorter.wired_display = true;
    if (typeof isWL_map !== "undefined")
    {
        for (index in isWL_map)
        {
            if (!Object.prototype.hasOwnProperty.call(isWL_map, index) || index === "0")
                continue;
            sorter["wl" + index + "_display"] = true;
        }
    }
    for (k in sorter)
    {
        if (!Object.prototype.hasOwnProperty.call(sorter, k))
            continue;
        if (yazfiIsBandBucket(k.replace(/_display$/, "")) && k.substring(k.length - 8) === "_display")
            sorter[k] = true;
    }
}

function yazfiSectionPresent(arrayName)
{
    var key = yazfiListKey(arrayName);

    return !!(document.getElementById("tr_" + key + "_title") ||
        document.getElementById("clientlist_" + arrayName + "_Block"));
}

function yazfiInstallViewWrappers()
{
    var origCreate, origSorter, origDo, origDrawBorder, origDraw, origExport, origMode;

    if (typeof create_clientlist_listview !== "function" || create_clientlist_listview._yazfi)
        return;

    origCreate = create_clientlist_listview;
    create_clientlist_listview = function() {
        yazfiClearBuckets();
        var result = origCreate.apply(this, arguments);
        if (typeof clienlistViewMode !== "undefined" && clienlistViewMode === "ByInterface")
            yazfiDecorateByInterface();
        return result;
    };
    create_clientlist_listview._yazfi = true;

    if (typeof sorterClientList === "function")
    {
        origSorter = sorterClientList;
        sorterClientList = function() {
            var indexMapType = ["", "", "str", "num", "str", "num", "num", "num", "num"];
            var index, k;

            if (typeof clienlistViewMode === "undefined" || clienlistViewMode !== "ByInterface")
                return origSorter.apply(this, arguments);

            function go(arrayName, sortIndex) {
                var method;

                if (!yazfiSectionPresent(arrayName))
                    return;
                if (sortIndex == null)
                    sortIndex = 3;
                method = indexMapType[sortIndex] || "str";
                sorter.doSorter(sortIndex, method, arrayName);
            }

            if (typeof isWL_map !== "undefined")
            {
                for (index in isWL_map)
                {
                    if (!Object.prototype.hasOwnProperty.call(isWL_map, index))
                        continue;
                    if (index === "0")
                        go("wired_list", sorter.wired_index);
                    else
                        go("wl" + index + "_list", sorter["wl" + index + "_index"]);
                }
            }
            if (typeof gn_list !== "undefined")
            {
                for (k in gn_list)
                {
                    if (Object.prototype.hasOwnProperty.call(gn_list, k) && yazfiIsBandBucket(k))
                        go(k + "_list", sorter[k + "_index"]);
                }
            }
        };
    }

    if (typeof sorter !== "undefined" && typeof sorter.doSorter === "function")
    {
        origDo = sorter.doSorter;
        sorter.doSorter = function(_flag, _Method, _arrayName) {
            var key = yazfiListKey(_arrayName);
            var how, fn;

            if (typeof clienlistViewMode !== "undefined" &&
                clienlistViewMode === "ByInterface" && yazfiIsBandBucket(key))
            {
                if (!yazfiSectionPresent(_arrayName))
                    return;
                sorter.indexFlag = _flag;
                how = sorter["sortingMethod_" + key] || "increase";
                fn = sorter[_Method + "_" + how];
                if (gn_list[key] && typeof fn === "function")
                    gn_list[key].sort(fn);
                drawClientListBlock(_arrayName);
                sorter.drawBorder(_arrayName);
                return;
            }
            if (typeof clienlistViewMode !== "undefined" &&
                clienlistViewMode === "ByInterface" && key && key !== "all" &&
                !yazfiSectionPresent(_arrayName))
                return;
            return origDo.apply(sorter, arguments);
        };

        origDrawBorder = sorter.drawBorder;
        sorter.drawBorder = function(_arrayName) {
            var key = yazfiListKey(_arrayName);
            var title = document.getElementById("tr_" + key + "_title");
            var clickIndex, method, css;

            if (!title)
                return;
            if (yazfiIsBandBucket(key))
            {
                clickIndex = sorter[key + "_index"];
                if (clickIndex == null)
                    clickIndex = 2;
                method = sorter["sortingMethod_" + key] || "increase";
                css = (method === "increase") ? "0 1px 0 #FC0 inset" : "0 -1px 0 #FC0 inset";
                if (title.childNodes[clickIndex] && title.childNodes[clickIndex].style)
                    title.childNodes[clickIndex].style.boxShadow = css;
                return;
            }
            return origDrawBorder.call(sorter, _arrayName);
        };
    }

    if (typeof drawClientListBlock === "function")
    {
        origDraw = drawClientListBlock;
        drawClientListBlock = function(objID) {
            var key, shortKey, saved, result;

            if (typeof isSupport === "function" && isSupport("amas") &&
                String(objID).substring(0, 2) === "gn")
            {
                key = yazfiListKey(objID);
                if (yazfiIsBandBucket(key) && typeof gn_list !== "undefined" && gn_list[key])
                {
                    shortKey = String(objID).substring(0, 3);
                    saved = gn_list[shortKey];
                    gn_list[shortKey] = gn_list[key];
                    try {
                        result = origDraw.call(this, objID);
                    }
                    finally {
                        gn_list[shortKey] = saved;
                    }
                    return result;
                }
            }
            return origDraw.apply(this, arguments);
        };
    }

    if (typeof exportClientListLog === "function")
    {
        origExport = exportClientListLog;
        exportClientListLog = function() {
            var saved = {};
            var i, k, rows, isGN, gnCount;

            if (typeof clienlistViewMode !== "undefined" && clienlistViewMode === "ByInterface" &&
                typeof isSupport === "function" && isSupport("amas") &&
                typeof gn_list !== "undefined" && typeof multissid_count !== "undefined")
            {
                gnCount = parseInt(multissid_count, 10) || 0;
                for (i = 1; i <= gnCount; i++)
                {
                    saved[i] = gn_list["gn" + i];
                    gn_list["gn" + i] = [];
                }
                for (k in gn_list)
                {
                    if (!Object.prototype.hasOwnProperty.call(gn_list, k) || !yazfiIsBandBucket(k))
                        continue;
                    isGN = yazfiBucketParts(k).isGN;
                    if (!gn_list["gn" + isGN])
                        gn_list["gn" + isGN] = [];
                    rows = gn_list[k] || [];
                    for (i = 0; i < rows.length; i++)
                        gn_list["gn" + isGN].push(rows[i]);
                }
            }
            try {
                return origExport.apply(this, arguments);
            }
            finally {
                for (i in saved)
                {
                    if (Object.prototype.hasOwnProperty.call(saved, i))
                        gn_list["gn" + i] = saved[i];
                }
            }
        };
    }

    if (typeof changeClientListViewMode === "function")
    {
        origMode = changeClientListViewMode;
        changeClientListViewMode = function() {
            yazfiExpandInterfaceFlags();
            return origMode.apply(this, arguments);
        };
    }
}

function yazfiNoteSavedName(mac, name)
{
    if (!mac || !name)
        return;
    yazfiRememberNick(mac, name);
    yazfiSyncCustomOverrides();
    if (typeof yazfiRequestClientData === "function")
        yazfiRequestClientData(true);
}

function yazfiCancelNameEdit(index)
{
    var input = document.getElementById("client_name_" + index);
    var div = document.getElementById("div_clientName_" + index);
    var label = "";

    if (div)
    {
        div.style.display = "";
        label = div.textContent || div.innerText || "";
    }
    if (input)
    {
        input.style.display = "none";
        input.value = String(label).replace(/^\s+|\s+$/g, "");
    }
    if (typeof edit_client_name_flag !== "undefined")
        edit_client_name_flag = false;
}

function yazfiInstallRenameWrappers()
{
    var origSave, origCard;

    if (typeof saveClientName === "function" && !saveClientName._yazfi)
    {
        origSave = saveClientName;
        saveClientName = function(index, type, mac) {
            var input, name, result;

            if (yazfiNameSaveSuppress)
            {
                yazfiNameSaveSuppress = false;
                yazfiCancelNameEdit(index);
                return false;
            }
            if (yazfiNameSaveDepth)
                return;
            input = document.getElementById("client_name_" + index);
            if (input)
                input.setAttribute("data-yazfi-saved", "1");
            yazfiNameSaveDepth++;
            try {
                result = origSave.apply(this, arguments);
            }
            finally {
                yazfiNameSaveDepth--;
            }
            if (result !== false && mac)
            {
                name = "";
                if (input)
                    name = String(input.value || "").replace(/^\s+|\s+$/g, "");
                if (name)
                    yazfiNoteSavedName(mac, name);
            }
            return result;
        };
        saveClientName._yazfi = true;
    }

    if (typeof card_confirm === "function" && !card_confirm._yazfi)
    {
        origCard = card_confirm;
        card_confirm = function(event) {
            var macField = document.getElementById("card_client_macaddr_field");
            var nameField = document.getElementById("card_client_name");
            var mac = macField ? String(macField.value || "").toUpperCase() : "";
            var name = nameField ? String(nameField.value || "").replace(/^\s+|\s+$/g, "") : "";
            var result = origCard.apply(this, arguments);
            var saved = "";

            if (typeof card_client_variable !== "undefined" && card_client_variable)
                saved = yazfiParseCustomClientList(card_client_variable.custom_clientlist)[mac] || "";
            if (mac && name && saved === name)
                yazfiNoteSavedName(mac, name);
            return result;
        };
        card_confirm._yazfi = true;
    }
}

function yazfiInvokeNameSave(input)
{
    var handler = input.getAttribute("onblur") || "";
    var match = /saveClientName\(\s*"([^"]+)"\s*,\s*([^,]+)\s*,\s*"([^"]*)"\s*\)/.exec(handler);

    if (!match || typeof saveClientName !== "function")
        return;
    saveClientName(match[1], match[2], match[3]);
}

function yazfiOnNameKeydown(e)
{
    var event = e || window.event;
    var target = event.target || event.srcElement;
    var key, idx, div;

    if (!target || !target.id || target.id.indexOf("client_name_") !== 0)
        return;
    /* The field is display:none until the user clicks the name. Ignore keys
       (including Enter repeat) after saveClientName has hidden it. */
    if (target.style.display === "none")
        return;
    key = event.keyCode || event.which;
    if (key !== 13 && key !== 27)
        return;
    if (event.preventDefault)
        event.preventDefault();
    event.returnValue = false;
    if (event.stopPropagation)
        event.stopPropagation();

    if (key === 27)
    {
        idx = target.id.substring("client_name_".length);
        div = document.getElementById("div_clientName_" + idx);
        if (div)
            target.value = div.textContent || div.innerText || "";
        yazfiNameSaveSuppress = true;
        target.blur();
        /* If blur did not run the inline handler, cancel explicitly. */
        if (target.style.display !== "none")
            yazfiCancelNameEdit(idx);
        setTimeout(function() { yazfiNameSaveSuppress = false; }, 0);
        return false;
    }

    if (target.getAttribute("data-yazfi-enter") === "1")
        return false;
    target.setAttribute("data-yazfi-enter", "1");
    target.setAttribute("data-yazfi-saved", "");
    try {
        if (document.activeElement === target)
            target.blur();
        if (target.getAttribute("data-yazfi-saved") !== "1")
        {
            var previous = target.onblur;
            target.onblur = null;
            yazfiInvokeNameSave(target);
            target.onblur = previous;
        }
    }
    finally {
        target.removeAttribute("data-yazfi-enter");
    }
    return false;
}

function yazfiInstallNameKeys()
{
    if (yazfiInstallNameKeys.done || !document || !document.addEventListener && !document.attachEvent)
        return;
    if (document.addEventListener)
        document.addEventListener("keydown", yazfiOnNameKeydown, false);
    else
        document.attachEvent("onkeydown", yazfiOnNameKeydown);
    yazfiInstallNameKeys.done = true;
}

function yazfiWrapEditConfirm()
{
    var orig;

    if (typeof edit_confirm !== "function" || edit_confirm._yazfi)
        return;
    orig = edit_confirm;
    edit_confirm = function() {
        var field = document.getElementById("macaddr_field");
        var nameField = document.getElementById("client_name");
        var mac = field ? String(field.value || "").toUpperCase() : "";
        var name = nameField ? String(nameField.value || "").replace(/^\s+|\s+$/g, "") : "";
        var result = orig.apply(this, arguments);
        var saved = (typeof custom_name === "string") ? (yazfiParseCustomClientList(custom_name)[mac] || "") : "";

        if (mac && name && saved === name)
            yazfiNoteSavedName(mac, name);
        return result;
    };
    edit_confirm._yazfi = true;
}

function yazfiWrapLateEditors()
{
    yazfiWrapEditConfirm();
    /* Snapshot custom_name once index.asp has defined it. Not an edit. */
    yazfiSyncCustomOverrides();
}

yazfiInstallViewWrappers();
yazfiInstallRenameWrappers();
yazfiInstallNameKeys();
yazfiSyncCustomOverrides();
setTimeout(yazfiWrapLateEditors, 0);
