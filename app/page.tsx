import { AsanaProvider } from "@/app/components/AsanaProvider";
import DashboardShell from "@/app/components/DashboardShell";

export default function Home() {
  return (
    <AsanaProvider>
      <DashboardShell />
    </AsanaProvider>
  );
}
