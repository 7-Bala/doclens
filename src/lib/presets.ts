import type { Role } from "./schemas";

export const ROLE_OPTIONS: { value: Role; label: string; hint: string }[] = [
  { value: "tenant", label: "Tenant", hint: "Rental / leave-and-licence agreement" },
  { value: "employee", label: "Employee", hint: "Offer letter, employment bond" },
  { value: "freelancer", label: "Freelancer", hint: "Client contract, NDA" },
  { value: "consumer", label: "Consumer", hint: "Terms of service, policy" },
  { value: "other", label: "Other", hint: "Any document you must sign" },
];

export const CONCERN_PRESETS: Record<Role, string[]> = {
  tenant: ["Security deposit refund", "Lock-in & early exit", "Rent increase", "Repairs & maintenance", "Eviction & notice"],
  employee: ["Notice period", "Service bond / penalty", "Non-compete", "Salary & clawback", "Termination"],
  freelancer: ["Payment terms", "IP ownership", "Liability & indemnity", "Termination", "Confidentiality"],
  consumer: ["Auto-renewal & cancellation", "Refunds", "Data sharing", "Fees & charges", "Dispute resolution"],
  other: ["Money I owe", "Penalties", "How to exit", "My obligations"],
};

export const SAMPLES: { file: string; label: string; role: Role; concerns: string[] }[] = [
  {
    file: "/samples/rental-agreement.txt",
    label: "Rental agreement",
    role: "tenant",
    concerns: ["Security deposit refund", "Lock-in & early exit"],
  },
  {
    file: "/samples/offer-letter.txt",
    label: "Job offer letter",
    role: "employee",
    concerns: ["Service bond / penalty", "Notice period", "Non-compete"],
  },
];
