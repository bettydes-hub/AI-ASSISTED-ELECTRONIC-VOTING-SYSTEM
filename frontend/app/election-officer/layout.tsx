'use client';

import { ReactNode } from 'react';
import RoleGate from '../../components/RoleGate';

export default function ElectionOfficerLayout(props: { children: ReactNode }) {
  return <RoleGate allowedRoles={['ElectionOfficer']}>{props.children}</RoleGate>;
}
