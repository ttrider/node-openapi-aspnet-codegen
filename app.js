var swaggerParser = require('swagger-parser');
var fs = require("fs");
var path = require("path");
var argv = require('minimist')(process.argv.slice(2));
if (argv.h || argv.help) {
    printUsage();
}
var input = getPath(argv.input, argv.i);
if (!input) {
    console.error("no input file specified");
    printUsage();
}
var modelOutput = getPath(argv.model, argv.m);
if (!modelOutput) {
    modelOutput = getPath(input, null, ".model.cs");
}
var controllerOutput = getPath(argv.controller, argv.c);
if (!controllerOutput) {
    controllerOutput = getPath(input, null, ".controller.cs");
}
console.log("reading " + input);
swaggerParser.validate(input, {
    $refs: {
        internal: false // Don't dereference internal $refs, only external
    }
})
    .then(function (api) {
    console.log("writing " + modelOutput);
    var output = fs.WriteStream(modelOutput);
    output.write("// <copyright company=\"AdaptCore Technologies\">\r\n");
    output.write("// Copyright (c) 2013 - 2016 All Rights Reserved\r\n");
    output.write("// </copyright>\r\n");
    output.write("// ReSharper disable InconsistentNaming\r\n");
    output.write("using System;\r\n");
    output.write("using System.Collections.Generic;\r\n");
    output.write("using System.Linq;\r\n");
    output.write("using System.Web;\r\n");
    output.write("using Newtonsoft.Json;\r\n");
    output.write("using System.Xml.Serialization;\r\n");
    output.write("\r\n");
    output.write("namespace AdaptCore.Web.Models\r\n");
    output.write("{\r\n");
    for (var name in api.definitions) {
        var item = api.definitions[name];
        if (item.enum) {
            output.write("\t[Flags]\r\n");
            output.write("\tpublic enum ");
            output.write(name);
            output.write("\r\n");
            output.write("\t{\r\n");
            for (var i = 0; i < item.enum.length; i++) {
                var ei = item.enum[i];
                output.write("\t\t");
                output.write(ei.replace(":", " = ") + ",\r\n");
            }
            output.write("\t}\r\n\r\n");
        }
        else {
            output.write("\tpublic partial class ");
            output.write(name);
            var properties = item.properties;
            var baseClass = "";
            if (item.allOf) {
                for (var j = 0; j < item.allOf.length; j++) {
                    if (item.allOf[j]["$ref"]) {
                        baseClass = item.allOf[j]["$ref"].substring(14);
                    }
                    else if (item.allOf[j].properties) {
                        properties = item.allOf[j].properties;
                    }
                }
            }
            if (baseClass) {
                output.write(" : ");
                output.write(baseClass);
            }
            output.write("\r\n");
            output.write("\t{\r\n");
            for (var propname in properties) {
                var prop = properties[propname];
                var propType = getType(prop);
                output.write("\t\t[JsonProperty(NullValueHandling = NullValueHandling.Ignore, PropertyName = \"");
                output.write(propname[0].toLowerCase() + propname.substring(1));
                output.write("\")]\r\n");
                output.write("\t\tpublic ");
                output.write(propType);
                output.write(" ");
                output.write(propname[0].toUpperCase() + propname.substring(1));
                output.write(" { get; set;}\r\n");
            }
            output.write("\t}\r\n\r\n");
        }
    }
    output.write("}\r\n");
    output.end();
    //output.flush();
    //output.close();
    //process.exit(1);
})
    .catch(function (err) {
    console.error(err.message);
    process.exit(1);
});
function printUsage() {
    console.log("usage:");
    console.log("  -i[nput] input file, .json or .yaml");
    console.log("  -[m[odel]] model output");
    console.log("  -[mn[amespace]] model namespace");
    console.log("  -[c[ontroller]] controller output");
    console.log("  -[cn[amespace]] controller namespace");
    process.exit(1);
}
function coalesce(val1, val2, val3) {
    if (val2 === void 0) { val2 = null; }
    if (val3 === void 0) { val3 = null; }
    if (!val1) {
        if (!val2) {
            if (!val3) {
                return null;
            }
            return val3;
        }
        return val2;
    }
    return val1;
}
function getPath(path1, path2, altExt) {
    var p = coalesce(path1, path2);
    if (!p) {
        return null;
    }
    p = path.normalize(p);
    if (!altExt) {
        return p;
    }
    var parts = path.parse(p);
    return path.join(parts.dir, parts.name + altExt);
}
function getType(prop) {
    if (prop["$ref"]) {
        return prop["$ref"].substring(14);
    }
    else if (prop.type === "string") {
        return prop.type;
    }
    else if (prop.type === "integer") {
        return "int";
    }
    else if (prop.type === "boolean") {
        return "bool";
    }
    else if (prop.type === "object") {
        return "object";
    }
    else if (prop.type === "number") {
        return "long";
    }
    else if (prop.type === "array") {
        return "IEnumerable<" + getType(prop.items) + ">";
    }
    else {
        return "object";
    }
}
//# sourceMappingURL=app.js.map