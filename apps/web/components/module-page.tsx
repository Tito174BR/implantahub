'use client';

import { AppShell } from './app-shell';
import { ResourceCenter } from './resource-center';

export function ModulePage({ title, subtitle, eyebrow, groups }: {
  title: string;
  subtitle: string;
  eyebrow: string;
  groups: string[];
}) {
  return (
    <AppShell title={title} subtitle={subtitle} eyebrow={eyebrow}>
      <ResourceCenter groups={groups} />
    </AppShell>
  );
}
