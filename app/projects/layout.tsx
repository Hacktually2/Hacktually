import { WorkspaceHeader } from "@/components/app-shell/workspace-header";
import { requireSession } from "@/lib/session";

/**
 * Everything under /projects is the signed-in product. The guard lives here so
 * no page has to remember it.
 */
export default async function WorkspaceLayout({ children }: LayoutProps<"/projects">) {
  const session = await requireSession();

  return (
    <>
      <WorkspaceHeader session={session} />
      {children}
    </>
  );
}
