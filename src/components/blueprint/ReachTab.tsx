'use client';

import { useMemo } from 'react';
import { KeyRound, ShieldAlert } from 'lucide-react';

import type { BlueprintSession } from './session';
import { EmptyHint, SectionTitle, SourceLink, type NavigateToSource } from './ui';

const ROW_LIMIT = 60;

/**
 * "What can agents reach?" Only names and redacted previews are ever rendered:
 * never server commands, URLs or values, which can embed credentials.
 */
export default function ReachTab({ session, onNavigateToSource }: { session: BlueprintSession; onNavigateToSource?: NavigateToSource }) {
  const reach = session.report?.reach ?? null;
  const names = useMemo(
    () => new Map((session.blueprint?.components ?? []).map((component) => [component.id, component.name])),
    [session.blueprint],
  );

  if (!reach) {
    return <div className="p-3"><EmptyHint>No agent configuration was analysed for this source, so reach is unknown.</EmptyHint></div>;
  }

  const broad = reach.permissions.filter((permission) => permission.broad && permission.effect !== 'deny');
  const envAccess = [...reach.envAccess].sort((left, right) => Number(right.secretLike) - Number(left.secretLike) || left.name.localeCompare(right.name));

  return (
    <div className="space-y-5 p-3">
      <p className="text-xs leading-4 text-slate-400">What can agents reach? Tools, credentials and permissions granted by files in this repository.</p>

      <section aria-label="Inline secrets" className="space-y-2">
        <SectionTitle count={reach.inlineSecrets.length}>Inline secrets</SectionTitle>
        {reach.inlineSecrets.length === 0 ? (
          <EmptyHint>No credentials are written into agent configuration files.</EmptyHint>
        ) : (
          <ul className="space-y-1.5">
            {reach.inlineSecrets.map((secret, index) => (
              <li key={`${secret.path}:${secret.line}:${index}`} className="rounded-lg border border-red-500/50 bg-red-500/10 p-2">
                <p className="flex items-center gap-1.5 text-xs font-medium text-red-100">
                  <ShieldAlert size={13} className="shrink-0" aria-hidden="true" />
                  <span>{secret.kind}</span>
                </p>
                <p className="mt-1 text-xs text-red-200">
                  Redacted preview: <code data-testid="secret-preview" className="font-mono">{secret.preview}</code>
                </p>
                <p className="mt-0.5 break-all font-mono text-xs text-red-200/80">{secret.location}</p>
                <p className="mt-1"><SourceLink target={{ path: secret.path, line: secret.line }} onNavigate={onNavigateToSource} /></p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="MCP servers" className="space-y-2">
        <SectionTitle count={reach.mcpServers.length}>MCP servers</SectionTitle>
        {reach.mcpServers.length === 0 ? (
          <EmptyHint>No MCP servers are configured in this repository.</EmptyHint>
        ) : (
          <ul className="space-y-1.5">
            {reach.mcpServers.slice(0, ROW_LIMIT).map((server) => (
              <li key={`${server.configPath}:${server.name}`} className="rounded-lg border border-slate-800 bg-slate-950/60 p-2">
                <p className="flex flex-wrap items-center gap-1.5 text-xs text-slate-100">
                  <span className="font-medium">{server.name}</span>
                  <span className="rounded border border-slate-700 px-1.5 py-0.5 text-xs text-slate-300">{server.agent}</span>
                  <span className="rounded border border-slate-700 px-1.5 py-0.5 text-xs text-slate-300">{server.transport}</span>
                </p>
                <p className="mt-1 text-xs leading-4 text-slate-400">
                  {server.env.length ? <>Receives env: <span className="font-mono text-slate-200">{server.env.join(', ')}</span></> : 'Receives no environment variables'}
                </p>
                <p className="mt-1"><SourceLink target={{ path: server.configPath }} onNavigate={onNavigateToSource} /></p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Broad permissions" className="space-y-2">
        <SectionTitle count={broad.length}>Broad permissions</SectionTitle>
        {broad.length === 0 ? (
          <EmptyHint>No unconstrained shell, network or write grants were found.</EmptyHint>
        ) : (
          <ul className="space-y-1.5">
            {broad.slice(0, ROW_LIMIT).map((permission, index) => (
              <li key={`${permission.path}:${permission.rule}:${index}`} className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-2">
                <p className="flex flex-wrap items-center gap-1.5 text-xs text-slate-100">
                  <span className="rounded border border-amber-500/50 px-1.5 py-0.5 text-xs font-semibold uppercase text-amber-200">{permission.effect}</span>
                  <code className="break-all font-mono text-xs text-amber-100">{permission.rule}</code>
                </p>
                <p className="mt-1 text-xs text-slate-400">{permission.agent}</p>
                <p className="mt-0.5"><SourceLink target={{ path: permission.path }} onNavigate={onNavigateToSource} /></p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Environment access" className="space-y-2">
        <SectionTitle count={envAccess.length}>Environment access</SectionTitle>
        {envAccess.length === 0 ? (
          <EmptyHint>No code reads environment variables.</EmptyHint>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-800">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 text-slate-400">
                <tr>
                  <th scope="col" className="px-2 py-1.5 font-medium">Variable</th>
                  <th scope="col" className="px-2 py-1.5 font-medium">Read by</th>
                  <th scope="col" className="px-2 py-1.5 font-medium">File</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {envAccess.slice(0, ROW_LIMIT).map((entry) => (
                  <tr key={entry.name} className="align-top">
                    <th scope="row" className="px-2 py-1.5 font-normal">
                      <span className="break-all font-mono text-slate-100">{entry.name}</span>
                      {entry.secretLike && (
                        <span className="mt-0.5 flex items-center gap-1 text-xs text-amber-200"><KeyRound size={10} aria-hidden="true" /> secret-like</span>
                      )}
                    </th>
                    <td className="px-2 py-1.5 text-slate-300">{entry.readers.map((reader) => names.get(reader) ?? reader).join(', ') || 'unmapped'}</td>
                    <td className="px-2 py-1.5">
                      {entry.files[0]
                        ? <SourceLink target={{ path: entry.files[0] }} onNavigate={onNavigateToSource} />
                        : <span className="text-slate-500">unknown</span>}
                      {entry.files.length > 1 && <span className="block text-xs text-slate-500">+{entry.files.length - 1} more</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {envAccess.length > ROW_LIMIT && <p className="px-2 py-1.5 text-xs text-slate-500">+{envAccess.length - ROW_LIMIT} more variables</p>}
          </div>
        )}
      </section>
    </div>
  );
}
