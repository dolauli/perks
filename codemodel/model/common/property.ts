import { uid } from './uid';

import { Initializer, DeepPartial } from '@azure-tools/codegen';
import { Value } from './value';
import { Schema } from './schema';

/** a property is a child value in an object */
export interface Property extends Value {
  /** if the property is marked read-only (ie, not intended to be sent to the service) */
  readOnly?: boolean;

  /** the wire name of this property */
  serializedName: string;

  // add addtional x-ms-mutability-style-stuff 
}

export class Property extends Value implements Property {

  constructor(name: string, description: string, schema: Schema, initializer?: DeepPartial<Property>) {
    super(name, description, schema);

    this.serializedName = name;
    this.language.default.uid = `property:${uid()}`;
    this.apply(initializer);
  }
}