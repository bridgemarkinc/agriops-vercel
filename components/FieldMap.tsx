import React from "react";

export default function FieldMap({ tenantId }: { tenantId: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-96 py-24 text-center text-muted-foreground">
      <h3 className="text-3xl font-semibold mb-4">Component Name</h3>
      <p className="text-lg">Coming soon — this section is under construction</p>
      <p className="mt-mt-2 text-sm opacity-60">tenant_id: {tenantId}</p>
    </div>
  );
}