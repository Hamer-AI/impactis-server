import { SetMetadata } from '@nestjs/common';

export const CAPABILITY_KEY = 'required_capability';

export type RequiredCapability = string | string[];

export const RequiresCapability = (capability: RequiredCapability) =>
  SetMetadata(CAPABILITY_KEY, capability);

