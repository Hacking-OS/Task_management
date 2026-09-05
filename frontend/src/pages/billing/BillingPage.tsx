import { Link } from "react-router-dom";
import { PageHeader } from "../../shared/PageHeader";

/** Placeholder until timesheet billing export / invoicing ships. */
export function BillingPage() {
  return (
    <div>
      <PageHeader
        title="Billing"
        subtitle="Timesheet acceptance feeds billing once this module is ready."
      />

      <section className="card billing-placeholder">
        <span className="badge badge-muted">In development</span>
        <h2 className="billing-placeholder-title">Billing is in development</h2>
        <p className="muted billing-placeholder-copy">
          Accepted timesheets will eventually flow here for invoicing and client billing.
          For now, workspace owners and admins can accept or reject logged time from the
          timesheet day panel.
        </p>
        <div className="billing-placeholder-actions">
          <Link to="/timesheets" className="btn btn-primary">
            Open timesheets
          </Link>
        </div>
      </section>
    </div>
  );
}
