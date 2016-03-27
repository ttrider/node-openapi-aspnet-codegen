var swaggerParser = require('swagger-parser');
var fs = require("fs");
var path = require("path");
var argv = require('minimist')(process.argv.slice(2));


if (argv.h || argv.help) {
    printUsage();
}

var input = getPath(argv.i);
if (!input) {
    console.error("no input file specified");
    printUsage();
}

var modelOutput = getPath(argv.m);
var modelNamespace = argv.M;
if (!modelNamespace) {
    modelNamespace = "OpenApi";
}
var controllerOutput = getPath(argv.c);
var controllerNamespace = argv.C;
if (!controllerNamespace) {
    controllerNamespace = "OpenApi";
}

console.log("reading " + input);

swaggerParser.validate(input, {
    $refs: {
        internal: false   // Don't dereference internal $refs, only external
    }
})
    .then((api) => {

        if (modelOutput) {
            produceModel(api);
        }
        if (controllerOutput) {
            produceController(api);
        }

    })
    .catch((err) => {
        console.error(err.message);
        process.exit(1);
    });


function printUsage() {
    console.log("usage:");
    console.log("  -i <input file, .json or .yaml>");
    console.log("   [-m <model output file>]");
    console.log("   [-M <model namespace>]");
    console.log("   [-c <controller output>]");
    console.log("   [-C <controller namespace>]");
    console.log("   [--copyright=\"<company name>:<from - to>\"]");
    process.exit(1);
}


function getSupportedSerialization(api): { enableJson: boolean, enableXml: boolean } {

    var enableJson = false;
    var enableXml = false;
    if (api.produces) {
        for (var k = 0; k < api.produces.length; k++) {

            if (!!api.produces[k].match(/json/gi)) {
                enableJson = true;
            }
            if (!!api.produces[k].match(/xml/gi)) {
                enableXml = true;
            }
        }
    }

    if (!enableJson && !enableXml) {
        enableJson = true;
    }

    return {
        enableJson: enableJson,
        enableXml: enableXml
    };
}


function produceModel(api) {
    console.log("Generating model classes");
    console.log("writing " + modelOutput);

    var output = fs.WriteStream(modelOutput);

    if (argv.copyright) {
        outputCopyright(output, argv.copyright);
    }


    output.write("// ReSharper disable InconsistentNaming\r\n");
    output.write("// ReSharper disable PartialTypeWithSinglePart\r\n");

    output.write("using System;\r\n");
    output.write("using System.Collections.Generic;\r\n");

    var serialization = getSupportedSerialization(api);

    if (serialization.enableJson) {
        output.write("using Newtonsoft.Json;\r\n");
    }
    if (serialization.enableXml) {
        output.write("using System.Xml.Serialization;\r\n");
    }
    output.write("\r\n");

    output.write("namespace ");
    output.write(modelNamespace);
    output.write("\r\n{\r\n");

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
        } else {

            output.write("\tpublic partial class ");
            output.write(name);

            var properties = item.properties;
            var baseClass = "";

            if (item.allOf) {
                for (var j = 0; j < item.allOf.length; j++) {

                    if (item.allOf[j]["$ref"]) {
                        baseClass = item.allOf[j]["$ref"].substring(14);
                    } else if (item.allOf[j].properties) {
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

                var upperPropName = toCSharpCase(propname);
                var lowerPropName = toJsonCase(propname);

                var propType = getType(prop);
                if (serialization.enableJson) {
                    output.write("\t\t[JsonProperty(NullValueHandling = NullValueHandling.Ignore, PropertyName = \"");
                    output.write(lowerPropName);
                    output.write("\")]\r\n");
                }

                if (serialization.enableXml) {
                    if (isSimpleType(prop)) {
                        output.write("\t\t[XmlAttribute(AttributeName = \"");
                        output.write(upperPropName);
                        output.write("\")]\r\n");
                    }
                    else if (isObjectType(prop)) {
                        output.write("\t\t[XmlElement(ElementName = \"");
                        output.write(upperPropName);
                        output.write("\")]\r\n");
                    }
                    else if (isArrayType(prop)) {
                        //TODO: use Array/Array Item here
                        output.write("\t\t[XmlElement(ElementName = \"");
                        output.write(upperPropName);
                        output.write("\")]\r\n");
                    }
                }

                output.write("\t\tpublic ");
                output.write(propType);
                output.write(" ");
                output.write(upperPropName);
                output.write(" { get; set;}\r\n");
            }


            output.write("\t}\r\n\r\n");
        }

    }
    output.write("}\r\n");
    output.end();
}

function produceController(api) {
    console.log("Generating controller classes");
    console.log("writing " + controllerOutput);

    var output = fs.WriteStream(controllerOutput);

    if (argv.copyright) {
        outputCopyright(output, argv.copyright);
    }


    output.write("// ReSharper disable InconsistentNaming\r\n");
    output.write("// ReSharper disable PartialTypeWithSinglePart\r\n");

    output.write("using System;\r\n");
    output.write("using System.Collections.Generic;\r\n");
    output.write("using Microsoft.AspNet.Mvc;\r\n");
    output.write("using System.Threading.Tasks;\r\n");
    output.write("using " + modelNamespace + ";\r\n");

    var serialization = getSupportedSerialization(api);
    output.write("\r\n");

    output.write("namespace ");
    output.write(controllerNamespace);
    output.write("\r\n{\r\n");

    var bp = api.basePath.split(/\//);
    var controllerName = bp[bp.length - 1];


    output.write("\tpublic partial class ");
    output.write(toCSharpCase(controllerName));
    output.write("Controller : Controller\r\n\t{\r\n");

    for (var pathName in api.paths) {

        var route = api.basePath + pathName;

        output.write("\t\t#region " + route + "\r\n\r\n");

        var pathItem = api.paths[pathName];

        for (var verb in pathItem) {
            var verbInfo = pathItem[verb];

            var retType = null;
            for (var retn in verbInfo.responses) {
                var ret = verbInfo.responses[retn];
                if (ret.schema) {
                    retType = getType(ret.schema);
                    break;
                }
            }



            var methodName = toCSharpCase(verb.toLowerCase());
            var nameParts = pathName.split("/");
            for (var i = 0; i < nameParts.length; i++) {
                var npp = toCSharpCase(nameParts[i].toLowerCase());
                methodName = methodName + npp;
            }

            output.write("\t\t[Http" + toCSharpCase(verb.toLowerCase()) + "]\r\n");
            output.write("\t\t[Route(\"" + route + "\")]\r\n");
            output.write("\t\tpublic Task");
            if (retType) {
                output.write("<" + retType + ">");
            }
            output.write(" " + methodName + "Action(");

            if (verbInfo.parameters) {
                for (var j = 0; j < verbInfo.parameters.length; j++) {
                    var param = verbInfo.parameters[0];

                    if (j) {
                        output.write(", ");
                    }

                    //Header 
                    var paramIn = param.in.toLowerCase();

                    var type = getType(param);

                    if (paramIn === "body" || paramIn === "form") {
                        output.write("[FromBody]");
                    }
                    output.write(" ");
                    output.write(type);
                    output.write(" ");
                    output.write(param.name);
                }
            }

            output.write(")\r\n");
            output.write("\t\t{\r\n");
            output.write("\t\t\treturn ");
            output.write("this.");
            output.write(methodName);
            output.write("(");

            if (verbInfo.parameters) {

                for (var j = 0; j < verbInfo.parameters.length; j++) {
                    var param = verbInfo.parameters[0];
                    if (j) {
                        output.write(", ");
                    }
                    output.write(param.name);
                }
            }

            output.write(");\r\n");
            output.write("\t\t}\r\n\r\n");
        }



        output.write("\t\t#endregion " + pathName + "\r\n\r\n");

    }
    output.write("\t}\r\n");
    output.write("}\r\n");
    output.end();
}

function coalesce(val1, val2 = null, val3 = null) {
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

function getPath(path1: string, path2?: string, altExt?: string) {
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

    if (prop.schema && prop.schema["$ref"]) {
        return prop.schema["$ref"].substring(14);
    }
    else
    if (prop["$ref"]) {
        return prop["$ref"].substring(14);
    }
    else if (prop.type === "string") {
        if (!prop.format) {
            return "string";
        }
        else if (prop.format === "byte") {
            return "byte";
        }
        else if (prop.format === "binary") {
            return "byte";
        }
        else if (prop.format === "date") {
            return "DateTime";
        }
        else if (prop.format === "date-time") {
            return "DateTime";
        }
        return prop.type;
    }
    else if (prop.type === "integer") {
        if (!prop.format) {
            return "int";
        }
        else if (prop.format === "int32") {
            return "int";
        }
        else if (prop.format === "int64") {
            return "long";
        }
        return "int";
    }
    else if (prop.type === "boolean") {
        return "bool";
    }
    else if (prop.type === "object") {
        return "object";
    }
    else if (prop.type === "number") {
        if (!prop.format) {
            return "double";
        }
        else if (prop.format === "float") {
            return "float";
        }
        else if (prop.format === "double") {
            return "double";
        }
        return "double";
    }
    else if (prop.type === "array") {
        return "IEnumerable<" + getType(prop.items) + ">";
    } else {
        return "object";
    }
}

function isSimpleType(prop) {
    return !isObjectType(prop) && !isArrayType(prop);
}

function isObjectType(prop) {
    return !!prop["$ref"];
}

function isArrayType(prop) {
    return prop.type === "array";
}

function toJsonCase(str: string) {
    if (str && str.length > 0) {
        var result = str[0].toLowerCase();
        if (str.length > 1) {
            return result + str.substring(1);
        }
    }
    return str;
}

function toCSharpCase(str: string) {
    if (str && str.length > 0) {
        var result = str[0].toUpperCase();
        if (str.length > 1) {
            return result + str.substring(1);
        }
    }
    return str;
}


function outputCopyright(output, copyright: string) {
    var parts = copyright.split(":");
    var company = parts[0];
    var fromto = parts.length > 1 ? parts[1] : new Date().getFullYear();

    output.write("// <copyright company=\"" + company + "\">\r\n");
    output.write("// Copyright (c) " + fromto + " All Rights Reserved\r\n");
    output.write("// </copyright>\r\n");
}