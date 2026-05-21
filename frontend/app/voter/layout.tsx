'use client';

import { ReactNode } from 'react';
import RoleGate from '../../components/RoleGate';

export default function VoterLayout(props: { children: ReactNode }) {
  return <RoleGate allowedRoles={['Voter']}>{props.children}</RoleGate>;
}
