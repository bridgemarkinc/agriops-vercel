import PastureMaintenance from "@/components/PastureMaintenance";

export default function PasturePage() {
  // If you keep tenant in env or session, set it here:
  const tenantId = process.env.NEXT_PUBLIC_TENANT || "demo-tenant";
  return <PastureMaintenance tenantId={tenantId} />;
}
