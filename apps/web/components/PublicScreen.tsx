import React from 'react';
import { SCREENS, SCREEN_FAMILIES } from '@collabiz/types';

/** Container + breadcrumb + title for public (unauthenticated) registry screens. */
export function PublicScreen({ id, children, title, description }: { id: string; children: React.ReactNode; title?: string; description?: React.ReactNode }) {
  const def = SCREENS.find((s) => s.id === id)!;
  return (
    <div className="cz-container cz-section" data-screen={id}>
      <p className="cz-breadcrumb">{SCREEN_FAMILIES[def.family - 1].name} <span className="cz-screen-id">SCREEN {id}</span></p>
      <h1>{title ?? def.title}</h1>
      {description && <p className="cz-muted" style={{ maxWidth: 780 }}>{description}</p>}
      <div style={{ marginTop: 16 }}>{children}</div>
    </div>
  );
}
