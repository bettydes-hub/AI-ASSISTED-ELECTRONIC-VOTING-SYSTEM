'use client';

import { ReactNode } from 'react';
import RoleGate from '../../components/RoleGate';

export default function SystemAdminLayout(props: { children: ReactNode }) {
  return <RoleGate allowedRoles={['SystemAdmin']}>{props.children}</RoleGate>;
}
