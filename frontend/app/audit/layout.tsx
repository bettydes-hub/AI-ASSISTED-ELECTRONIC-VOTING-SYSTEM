'use client';

import { ReactNode } from 'react';
import RoleGate from '../../components/RoleGate';

export default function AuditLayout(props: { children: ReactNode }) {
  return <RoleGate allowedRoles={['AuditAuthority']}>{props.children}</RoleGate>;
}
