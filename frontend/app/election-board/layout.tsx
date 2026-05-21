'use client';

import { ReactNode } from 'react';
import RoleGate from '../../components/RoleGate';

export default function ElectionBoardLayout(props: { children: ReactNode }) {
  return <RoleGate allowedRoles={['ElectionBoard']}>{props.children}</RoleGate>;
}
