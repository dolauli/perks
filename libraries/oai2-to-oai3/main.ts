import { createGraphProxy, JsonPointer, Node, visit, FastStringify, parsePointer, get } from '@microsoft.azure/datastore';
import { Mapping } from 'source-map';
import { parse } from 'path';
import { values } from '../linq/dist/main';
import { shallowCopy } from '../tasks/dist/main';

export class Oai2ToOai3 {
  public generated: any;
  public mappings = new Array<Mapping>();

  constructor(protected originalFilename: string, protected original: any) {
    this.generated = createGraphProxy(this.originalFilename, '', this.mappings);
  }

  convert() {
    // process servers 
    if (this.original.host) {
      for (const { value: s, pointer } of visit(this.original.schemes)) {
        let server: any = {};
        server.url = (s ? s + ':' : '') + '//' + this.original.host + (this.original.basePath ? this.original.basePath : '');
        extractServerParameters(server);
        if (this.generated.servers === undefined) {
          this.generated.servers = this.newArray(pointer);
        }
        this.generated.servers.push({ value: server, pointer });
      }
    } else if (this.original.basePath) {
      let server: any = {};
      server.url = this.original.basePath;
      extractServerParameters(server);
      if (this.generated.servers === undefined) {
        this.generated.servers = this.newArray('/basePath');
      }
      this.generated.servers.push(server);
    }

    // internal function to extract server parameters
    function extractServerParameters(server) {
      server.url = server.url.split('{{').join('{');
      server.url = server.url.split('}}').join('}');
      server.url.replace(/\{(.+?)\}/g, function (match, group1) {
        if (!server.variables) {
          server.variables = {};
        }
        server.variables[group1] = { default: 'unknown' };
      });
    }

    for (const { value, key, pointer, children } of visit(this.original)) {
      switch (key) {
        case 'swagger':
          this.generated.openapi = { value: '3.0.0', pointer };
          break;
        case 'info':
          this.generated.info = this.newObject(pointer);
          this.visitInfo(children);
          break;
        case 'x-ms-paths':
        case 'paths':
          if (!this.generated.paths) {
            this.generated.paths = this.newObject(pointer);
          }
          this.visitPaths(children);
          break;
        case 'host':
        case 'basePath':
        case 'schemes':
          // Already processed.  
          break;
        case 'consumes':
          break;
        case 'produces':
          break;
        case 'definitions':
          if (!this.generated.components) {
            this.generated.components = this.newObject(pointer);
          }
          this.generated.components.schemas = this.newObject(pointer);
          this.visitDefinitions(children);
          break;
        case 'parameters':
          if (!this.generated.components) {
            this.generated.components = this.newObject(pointer);
          }
          this.generated.components.parameters = this.newObject(pointer);
          break;
        case 'responses':
          if (!this.generated.components) {
            this.generated.components = this.newObject(pointer);
          }
          this.generated.components.responses = this.newObject(pointer);
          //this.visitResponsesDefinitions(children);
          break;
        case 'securityDefinitions':
          if (!this.generated.components) {
            this.generated.components = this.newObject(pointer);
          }
          this.generated.components.securitySchemes = this.newObject(pointer);
          this.visitSecurityDefinitions(children);
          break;
        // no changes to security from OA2 to OA3
        case 'security':
          this.generated.security = { value, pointer, recurse: true };
          break;
        case 'tags':
          this.generated.tags = this.newArray(pointer);
          this.visitTags(children);
          break;
        case 'externalDocs':
          this.visitExternalDocs(this.generated, key, value, pointer);
          break;
        default:
          // handle stuff liks x-* and things not recognized
          this.visitExtensions(this.generated, key, value, pointer);
          break;
      }
    }

    return this.generated;
  }

  // DONE
  visitInfo(info: Iterable<Node>) {
    for (const { value, key, pointer, children } of info) {
      switch (key) {
        case 'title':
        case 'description':
        case 'termsOfService':
        case 'contact':
        case 'license':
        case 'version':
          this.generated.info[key] = { value, pointer };
          break;
        default:
          this.visitExtensions(info, key, value, pointer);
          this.visitUnspecified(children);
          break;
      }
    }
  }

  // DONE
  visitSecurityDefinitions(securityDefinitions: Iterable<Node>) {
    for (const { key: schemeName, value: v, pointer: jsonPointer, children: securityDefinitionsItemMembers } of securityDefinitions) {
      this.generated.components.securitySchemes[schemeName] = this.newObject(jsonPointer);
      const securityScheme = this.generated.components.securitySchemes[schemeName];
      switch (v.type) {
        case 'apiKey':
          for (const { key, value, pointer } of securityDefinitionsItemMembers) {
            switch (key) {
              case 'type':
              case 'description':
              case 'name':
              case 'in':
                securityScheme[key] = { value, pointer };
                break;
              default:
                this.visitExtensions(securityScheme, key, value, pointer);
                break;
            }
          }
          break;
        case 'basic':
          for (const { key, value, pointer } of securityDefinitionsItemMembers) {
            switch (key) {
              case 'description':
                securityScheme.description = { value, pointer };
                break;
              case 'type':
                securityScheme.type = { value: 'http', pointer };
                securityScheme.scheme = { value: 'basic', pointer };
                break;
              default:
                this.visitExtensions(securityScheme, key, value, pointer);
                break;
            }
          }
          break;
        case 'oauth2':
          securityScheme.type = { value: v.type, pointer: jsonPointer };
          securityScheme.flows = this.newObject(jsonPointer);
          let flowName = v.flow;

          // convert flow names to OpenAPI 3 flow names
          if (v.flow === 'application') {
            flowName = 'clientCredentials';
          }

          if (v.flow === 'accessCode') {
            flowName = 'authorizationCode';
          }

          securityScheme.flows[flowName] = this.newObject(jsonPointer);

          let authorizationUrl;
          let tokenUrl;
          let scopes;

          if (v.authorizationUrl) {
            authorizationUrl = v.authorizationUrl.split('?')[0].trim() || '/';
            securityScheme.flows[flowName].authorizationUrl = { value: authorizationUrl, pointer: jsonPointer };
          }

          if (v.tokenUrl) {
            tokenUrl = v.tokenUrl.split('?')[0].trim() || '/';
            securityScheme.flows[flowName].tokenUrl = { value: tokenUrl, pointer: jsonPointer };
          }

          scopes = v.scopes || {};
          securityScheme.flows[flowName].scopes = { value: scopes, pointer: jsonPointer };
          break;
      }
    }
  }

  // DONE
  visitDefinitions(definitions: Iterable<Node>) {
    for (const { key: schemaName, value: schemaValue, pointer: jsonPointer, childIterator: definitionsItemMembers } of definitions) {
      this.generated.components.schemas[schemaName] = this.newObject(jsonPointer);
      const schemaItem = this.generated.components.schemas[schemaName];
      this.visitSchema(schemaItem, schemaValue, definitionsItemMembers);
    }
  }

  // DONE
  visitProperties(target: any, propertiesItemMembers: () => Iterable<Node>) {
    for (const { key, value, pointer, childIterator } of propertiesItemMembers()) {
      target[key] = this.newObject(pointer);
      if (value.$ref) {
        let newReferenceValue = `#/components/schemas/${value.$ref.replace('#/definitions/', '')}`;
        target[key].$ref = { value: newReferenceValue, pointer };
      } else {
        this.visitSchema(target[key], value, childIterator);
      }
    }
  }

  visitSchema(target: any, schemaValue: any, schemaItemMemebers: () => Iterable<Node>) {
    for (const { key, value, pointer, childIterator } of schemaItemMemebers()) {
      switch (key) {
        case 'format':
        case 'title':
        case 'description':
        case 'default':
        case 'multipleOf':
        case 'maximum':
        case 'exclusiveMaximum':
        case 'minimum':
        case 'exclusiveMinimum':
        case 'maxLength':
        case 'minLength':
        case 'pattern':
        case 'maxItems':
        case 'minItems':
        case 'uniqueItems':
        case 'maxProperties':
        case 'minProperties':
        case 'required':
        case 'enum':
        case 'allOf':
        case 'readOnly':
          target[key] = { value, pointer, recurse: true };
          break;
        case 'items':
        case 'additionalProperties':
          target[key] = this.newObject(pointer);
          if (schemaValue[key].$ref) {
            let newReferenceValue = `#/components/schemas/${schemaValue[key].$ref.replace('#/definitions/', '')}`;
            target[key].$ref = { value: newReferenceValue, pointer };
          } else {
            this.visitSchema(target[key], value, childIterator)
          }
          break;
        case 'properties':
          target[key] = this.newObject(pointer);
          this.visitProperties(target[key], childIterator);
          break;
        case 'type':
          target.type = { value, pointer };
          if (value === null) {
            target.nullable = { value: true, pointer };
          }
          break;
        // in OpenAPI 3 the discriminator its an object instead of a string.
        case 'discriminator':
          target.discriminator = this.newObject(pointer);
          target.discriminator.propertyName = { value, pointer };
          break;
        case 'xml':
          this.visitXml(target, key, value, pointer);
          break;
        case 'externalDocs':
          this.visitExternalDocs(target, key, value, pointer);
          break;
        case 'example':
          target.example = { value, pointer, recurse: true };
          break;
        default:
          this.visitExtensions(target, key, value, pointer);
          break;
      }
    }
  }

  visitItems(target: any, key: string, value: any, pointer: string) {
    if (Array.isArray(target[key])) {
      if (target[key].length === 0) {
        // Value must be an object not an array. 
        // See: https://github.com/OAI/OpenAPI-Specification/blob/master/versions/3.0.0.md#schemaObject
        target[key] = { value: {}, pointer };
      } else if (target[key].length === 1) {
        target[key] = { value: value[0], pointer, recurse: true }
      } else {
        target[key] = { value: { anyOf: target[key] }, pointer };
      }
    } else {
      target[key] = { value, pointer, recurse: true };
    }
  }

  visitXml(target: any, key: string, value: any, pointer: string) {
    target[key] = { value, pointer, recurse: true };
  }

  visitTags(tags: Iterable<Node>) {
    for (const { key: index, pointer, children: tagItemMembers } of tags) {
      this.visitTag(parseInt(index), pointer, tagItemMembers);
    }
  }

  visitTag(index: number, jsonPointer: JsonPointer, tagItemMembers: Iterable<Node>) {
    this.generated.tags.push(this.newObject(jsonPointer));

    for (const { key, pointer, value } of tagItemMembers) {
      switch (key) {
        case 'name':
        case 'description':
          this.generated.tags[index][key] = { value, pointer };
          break;
        case 'externalDocs':
          this.visitExternalDocs(this.generated.tags[index], key, value, pointer);
          break;
        default:
          this.visitExtensions(this.generated.tags[index], key, value, pointer);
          break;
      }
    }
  }

  visitExtensions(target: any, key: string, value: any, pointer: string) {
    target[key] = { value, pointer, recurse: true };
  }

  visitExternalDocs(target: any, key: string, value: any, pointer: string) {
    target[key] = { value, pointer, recurse: true }
  }

  newArray(pointer: JsonPointer) {
    return { value: createGraphProxy(this.originalFilename, pointer, this.mappings, new Array<any>()), pointer };
  }

  newObject(pointer: JsonPointer) {
    return <any>{ value: createGraphProxy(this.originalFilename, pointer, this.mappings), pointer };
  }

  visitUnspecified(nodes: Iterable<Node>) {
    for (const { value, pointer } of nodes) {
      console.error(`?? Unknown item: ${pointer} : ${value} `);
    }
  }

  visitPaths(paths: Iterable<Node>) {
    for (const { key: uri, pointer, children: pathItemMembers } of paths) {
      this.visitPath(uri, pointer, pathItemMembers);
    }
  }

  visitPath(uri: string, jsonPointer: JsonPointer, pathItemMembers: Iterable<Node>) {
    this.generated.paths[uri] = this.newObject(jsonPointer);
    const pathItem = this.generated.paths[uri];
    for (const { value, key, pointer, children: pathItemFieldMembers } of pathItemMembers) {
      // handle each item in the path object
      switch (key) {
        case '$ref':
        case 'x-summary':
        case 'x-description':
          pathItem[key] = { value, pointer };
          break;
        case 'get':
        case 'put':
        case 'post':
        case 'delete':
        case 'options':
        case 'head':
        case 'patch':
        case 'x-trace':
          this.visitOperation(pathItem, key, pointer, pathItemFieldMembers, value);
          break;
        case 'parameters':
          break;
      }
    }
  }

  visitOperation(pathItem: any, httpMethod: string, jsonPointer: JsonPointer, operationItemMembers: Iterable<Node>, operationValue: any) {

    // trace was not supported on OpenAPI 2.0, it was an extension
    httpMethod = (httpMethod !== 'x-trace') ? httpMethod : 'trace';
    pathItem[httpMethod] = this.newObject(jsonPointer);

    // handle a single operation.
    const operation = pathItem[httpMethod];

    // preprocess produces and consumes for responses and parameters respectively;
    const produces = (!operationValue.produces.length) ? ['*/*'] : operationValue.produces;
    const consumes = (!operationValue.consumes) ? [] : operationValue.consumes;
    for (const { value, key, pointer, children: operationFieldItemMembers } of operationItemMembers) {
      switch (key) {
        case 'tags':
        case 'description':
        case 'summary':
        case 'operationId':
        case 'deprecated':
          operation[key] = { value, pointer };
          break;
        case 'externalDocs':
          this.visitExternalDocs(operation, key, value, pointer);
          break;
        case 'consumes':
          // handled beforehand for parameters
          break;
        case 'parameters':
          this.visitParameters(operation, operationFieldItemMembers, consumes, pointer);
          break;
        case 'produces':
          // handled beforehand for responses
          break;
        case 'responses':
          operation.responses = this.newObject(pointer);
          this.visitResponses(operation.responses, operationFieldItemMembers, produces);
          break;
        case 'schemes':
          break;
        case 'security':
          operation.security = { value, pointer, recurse: true };
          break;
        default:
          this.visitExtensions(operation, key, value, pointer);
          break;
      }
    }
  }

  visitParameters(targetOperation: any, parametersFieldItemMembers: any, consumes: any, pointer: any) {
    // the number on the request body index will depend on the number of parameters 
    // that added information to the requesBody
    const requestBodyIndex = { count: 0 };

    for (const { key: index, pointer, value, childIterator } of parametersFieldItemMembers) {
      this.visitParameter(targetOperation, value, pointer, childIterator, consumes, requestBodyIndex);
    }

    if (targetOperation.requestBody !== undefined) {
      targetOperation['x-ms-requestBody-index'] = { value: requestBodyIndex.count, pointer };
    }
  }

  visitParameter(targetOperation: any, parameterValue: any, pointer: string, parameterItemMembers: () => Iterable<Node>, consumes: Array<any>, requestBodyIndex: any) {

    if (parameterValue.in === 'formData' || parameterValue.in === 'body' || parameterValue.type === 'file') {

      if (targetOperation.requestBody === undefined) {
        targetOperation.requestBody = this.newObject(pointer);
      }

      if (targetOperation.requestBody['x-ms-requestBody-name'] === undefined) {
        targetOperation.requestBody['x-ms-requestBody-name'] = { value: parameterValue.name, pointer };
      }

      if (targetOperation.requestBody.content === undefined) {
        targetOperation.requestBody.content = this.newObject(pointer);
      }

      if (parameterValue.description !== undefined && targetOperation.requestBody.description === undefined) {
        targetOperation.requestBody.description = { value: parameterValue.description, pointer };
      }

      if (parameterValue.allowEmptyValue !== undefined && targetOperation.requestBody.description === undefined) {
        targetOperation.requestBody.allowEmptyValue = { value: parameterValue.allowEmptyValue, pointer };
      }

      if (parameterValue.required !== undefined && targetOperation.requestBody.required === undefined) {
        targetOperation.requestBody.required = { value: parameterValue.required, pointer };
      }

      if (parameterValue.in === 'formData') {
        requestBodyIndex.count += 1;

        let contentType = 'application/x-www-form-urlencoded';
        if ((consumes.length) && (consumes.indexOf('multipart/form-data') >= 0)) {
          contentType = 'multipart/form-data';
        }

        if (targetOperation.requestBody.content[contentType] === undefined) {
          targetOperation.requestBody.content[contentType] = this.newObject(pointer);
        }

        if (targetOperation.requestBody.content[contentType].schema === undefined) {
          targetOperation.requestBody.content[contentType].schema = this.newObject(pointer);
        }

        if (parameterValue.schema !== undefined) {
          if (parameterValue.schema.$ref !== undefined) {
            const newReferenceValue = `#/components/schemas/${parameterValue.schema.$ref.replace('#/definitions/', '')}`;
            targetOperation.requestBody.content[contentType].schema.$ref = { value: newReferenceValue, pointer };
          } else {
            for (const { key, value, childIterator } of parameterItemMembers()) {
              if (key === 'schema') {
                this.visitSchema(targetOperation.requestBody.content[contentType].schema, value, childIterator);
              }
            }
          }
        } else {
          const schema = targetOperation.requestBody.content[contentType].schema;
          if (schema.type === undefined) {
            schema.type = { value: 'object', pointer };
          }

          if (schema.properties === undefined) {
            schema.properties = this.newObject(pointer);
          }

          schema.properties[parameterValue.name] = this.newObject(pointer);
          const targetProperty = schema.properties[parameterValue.name];
          if (parameterValue.description !== undefined) {
            targetProperty.description = { value: parameterValue.description, pointer };
          }

          if (parameterValue.example !== undefined) {
            targetProperty.example = { value: parameterValue.example, pointer };
          }

          if (parameterValue.type !== undefined) {
            if (parameterValue.type === 'file') {
              targetProperty.type = { value: 'string', pointer };
              targetProperty.format = { value: 'binary', pointer };
            } else {
              targetProperty.type = { value: parameterValue.type, pointer };
            }
          }

          if (parameterValue.required === true) {
            if (schema.required === undefined) {
              schema.required = this.newArray(pointer);
              schema.required.push(parameterValue.name);
            }
          }

          if (parameterValue.default !== undefined) {
            targetProperty.default = { value: parameterValue.default, pointer };
          }

          if (parameterValue.allOf !== undefined) {
            targetProperty.allOf = { value: parameterValue.allOf, pointer };
          }

          if (parameterValue.type === 'array' && parameterValue.items !== undefined) {
            targetProperty.items = { value: parameterValue.items, pointer };
          }
        }
      } else if (parameterValue.type === 'file') {

        targetOperation['application/octet-stream'] = this.newObject(pointer);
        targetOperation['application/octet-stream'].schema = this.newObject(pointer);
        targetOperation['application/octet-stream'].schema.type = { value: 'string', pointer };
        targetOperation['application/octet-stream'].schema.format = { value: 'binary', pointer };

      }

      if (parameterValue.in === 'body') {
        requestBodyIndex.count += 1;

        const consumesTempArray = [...consumes];
        if (consumesTempArray.length === 0) {
          consumesTempArray.push('application/json');
        }

        for (let mimetype of consumesTempArray) {
          if (targetOperation.requestBody.content[mimetype] === undefined) {
            targetOperation.requestBody.content[mimetype] = this.newObject(pointer);
          }

          if (targetOperation.requestBody.content[mimetype].schema === undefined) {
            targetOperation.requestBody.content[mimetype].schema = this.newObject(pointer);
          }

          if (parameterValue.schema !== undefined) {
            if (parameterValue.schema.$ref !== undefined) {
              const newReferenceValue = `#/components/schemas/${parameterValue.schema.$ref.replace('#/definitions/', '')}`;
              targetOperation.requestBody.content[mimetype].schema.$ref = { value: newReferenceValue, pointer };
            } else {
              for (const { key, value, childIterator } of parameterItemMembers()) {
                if (key === 'schema') {
                  this.visitSchema(targetOperation.requestBody.content[mimetype].schema, value, childIterator);
                }
              }
            }
          } else {
            targetOperation.requestBody.content[mimetype].schema = this.newObject(pointer);
          }

        }
      }
    } else {
      if (targetOperation.parameters === undefined) {
        targetOperation.parameters = this.newArray(pointer);
      }

      targetOperation.parameters.push(this.newObject(pointer));

      const parameter = targetOperation.parameters[targetOperation.parameters.length - 1];

      if (parameterValue.name !== undefined) {
        parameter.name = { value: parameterValue.name, pointer };
      }

      if (parameterValue.in !== undefined) {
        parameter.in = { value: parameterValue.in, pointer };
      }

      if (parameterValue.description !== undefined) {
        parameter.description = { value: parameterValue.description, pointer };
      }

      if (parameterValue.allowEmptyValue !== undefined) {
        parameter.allowEmptyValue = { value: parameterValue.allowEmptyValue, pointer };
      }

      if (parameterValue.required !== undefined) {
        parameter.required = { value: parameterValue.required, pointer };
      }

      // Collection Format
      if (parameterValue.collectionFormat !== undefined) {
        if ((parameterValue.collectionFormat === 'csv') && ((parameterValue.in === 'query') || (parameterValue.in === 'cookie'))) {
          parameter.style = { value: 'form', pointer };
          parameter.explode = { value: false, pointer };
        }
        if ((parameterValue.collectionFormat === 'csv') && ((parameterValue.in === 'path') || (parameterValue.in === 'header'))) {
          parameter.style = { value: 'simple', pointer };
        }
        if (parameterValue.collectionFormat === 'ssv') {
          if (parameterValue.in === 'query') {
            parameter.style = { value: 'spaceDelimited', pointer };
          }
        }
        if (parameterValue.collectionFormat === 'pipes') {
          if (parameterValue.in === 'query') {
            parameter.style = { value: 'pipeDelimited', pointer };
          }
        }
        if (parameterValue.collectionFormat === 'multi') {
          parameter.explode = { value: true, pointer };
        }
      }

      if (parameter.schema === undefined) {
        parameter.schema = this.newObject(pointer);
      }

      if (parameterValue.schema !== undefined && parameterValue.schema.$ref !== undefined) {
        let newReferenceValue = `#/components/schemas/${parameterValue.schema.$ref.replace('#/definitions/', '')}`;
        parameter.schema.$ref = { value: newReferenceValue, pointer };
      } else {
        const schemaKeys = [
          'maximum',
          'exclusiveMaximum',
          'minimum',
          'exclusiveMinimum',
          'maxLength',
          'minLength',
          'pattern',
          'maxItems',
          'minItems',
          'uniqueItems',
          'enum',
          'multipleOf',
          'default',
          'format',
        ];
        for (const { key, childIterator } of parameterItemMembers()) {
          if (key === 'schema') {
            this.visitSchema(parameter.schema.items, parameterValue.items, childIterator);
          } else if (schemaKeys.indexOf(key) !== -1) {
            parameter.schema[key] = { value: parameterValue[key], pointer, recurse: true };
          }
        }
      }

      parameter.schema.type = { value: parameterValue.type, pointer };
      if (parameterValue.items !== undefined) {
        parameter.schema.items = this.newObject(pointer);
        if (parameterValue.items.$ref !== undefined) {
          let newReferenceValue = `#/components/schemas/${parameterValue.schema.items.$ref.replace('#/definitions/', '')}`;
          parameter.schema.items.$ref = { value: newReferenceValue, pointer };
        } else {
          for (const { key, childIterator } of parameterItemMembers()) {
            if (key === 'items') {
              this.visitSchema(parameter.schema.items, parameterValue.items, childIterator);
            }
          }
        }
      }
    }
  }

  visitResponses(target: any, responsesItemMembers: Iterable<Node>, produces: any) {
    for (const { key, value, pointer, childIterator } of responsesItemMembers) {
      target[key] = this.newObject(pointer);
      if (value.$ref) {
        let newReferenceValue = `#/components/responses/${value.$ref.replace('#/responses/', '')}`;
        target[key].$ref = { value: newReferenceValue, pointer };
      } else if (key.startsWith('x-')) {
        this.visitExtensions(target[key], key, value, pointer);
      } else {
        this.visitResponse(target[key], value, childIterator, pointer, produces);
      }
    }
  }

  visitResponse(responseTarget: any, responseValue: any, responsesFieldMembers: () => Iterable<Node>, jsonPointer: any, produces: any) {

    if (responseValue.description) {
      responseTarget.description = { value: responseValue.description, pointer: jsonPointer };
    }

    if (responseValue.schema) {
      responseTarget.content = this.newObject(jsonPointer);
      for (let mimetype of produces) {
        responseTarget.content[mimetype] = this.newObject(jsonPointer);
        responseTarget.content[mimetype].schema = this.newObject(jsonPointer);
        if (responseValue.schema.$ref) {
          const newReferenceValue = `#/components/schemas/${responseValue.schema.$ref.replace('#/definitions/', '')}`;
          responseTarget.content[mimetype].schema.$ref = { value: newReferenceValue, pointer: jsonPointer };
        } else {
          for (const { key, value, childIterator } of responsesFieldMembers()) {
            if (key === 'schema') {
              this.visitSchema(responseTarget.content[mimetype].schema, value, childIterator);
            }
          }
        }
      }
    }
  }
}