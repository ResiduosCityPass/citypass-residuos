import { SetMetadata } from '@nestjs/common';
import { Rol } from '../domain/enums';

export const ROLES_KEY = 'roles';

/** Restringe un endpoint a los roles indicados. Ver matriz en ADR-005. */
export const Roles = (...roles: Rol[]) => SetMetadata(ROLES_KEY, roles);
