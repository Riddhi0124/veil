// Entirely fictional documents with realistic structure, for demos and testing.
export interface Sample { id: string; label: string; blurb: string; text: string }

export const SAMPLES: Sample[] = [
  {
    id: "bill",
    label: "Hospital bill",
    blurb: "Short · stays on-device",
    text: `St. Brendan Regional Medical Center
Billing Statement — Patient Account

Patient: Maria Elena Vasquez
Account Number: SB-4471920
Date of Birth: 03/14/1988
Address: 2217 Marigold Lane, Apt 4B, Dayton, OH 45402
Phone: (937) 555-0148
Statement date: October 29, 2026
Date of service: September 18, 2026 (Emergency Department)

Charges
Emergency department facility fee, Level 4 ........ $3,850.00
Physician services (Dr. Alan Okafor) ............... $1,120.00
CT scan, abdomen/pelvis with contrast .............. $2,640.00
Laboratory panel (CBC, CMP, lipase) ................ $  860.00
IV fluids and medication administration ............ $  415.00
Total charges ...................................... $8,885.00

Insurance adjustments
Contracted rate adjustment (Northgate Health PPO) .. -$3,102.50
Insurance payment .................................. -$2,400.00
Patient balance .................................... $3,382.50

Notes
Claim NH-99203817 was processed on October 12, 2026. Your plan applied $2,000.00 to your deductible and a 20% coinsurance to the remaining allowed amount. The CT scan was billed under code 74177. Payment is due within 30 days of the statement date. Accounts unpaid after 60 days may be referred to an outside collections agency and reported to credit bureaus. To request an itemized bill or discuss payment plans, contact Patient Financial Services at billing@stbrendan-demo.example or (937) 555-0199.

Member ID: NGH-220-884731 | Group: 55120`,
  },
  {
    id: "lease",
    label: "Lease excerpt",
    blurb: "Long · escalates to cloud",
    text: `RESIDENTIAL LEASE AGREEMENT

This Lease Agreement ("Lease") is made on November 2, 2026 between Harborview Property Group LLC, acting through its agent Thomas R. Whitfield ("Landlord"), and Priya Raman and Daniel Okonkwo-Raman ("Tenant"), for the residential premises at 880 Juniper Street, Unit 12, Portland, OR 97214 ("Premises").

1. TERM. The Lease begins December 1, 2026 and ends November 30, 2027. Unless either party gives written notice at least sixty (60) days before the end date, this Lease automatically renews for a further term of twelve (12) months at a rent determined solely by Landlord, who will notify Tenant of the new rent no fewer than thirty (30) days before renewal.

2. RENT. Tenant shall pay $2,350.00 per month, due on the first day of each month, by electronic transfer to the account designated by Landlord. Rent received after the third (3rd) day of the month incurs a late fee of $125.00 plus $15.00 for each additional day until paid in full. Returned payments incur a $60.00 fee.

3. SECURITY DEPOSIT. Tenant shall pay a security deposit of $3,525.00 (one and one-half months' rent) before taking possession. Landlord may use the deposit for unpaid rent, damage beyond normal wear and tear, cleaning required to return the Premises to its original condition, and any other sums owed under this Lease. Landlord will return the balance, if any, within forty-five (45) days after Tenant vacates and returns all keys. A non-refundable administrative fee of $350.00 is also due at signing.

4. UTILITIES AND FEES. Tenant is responsible for electricity, gas, internet, and a flat monthly "building services fee" of $85.00 covering water, sewer, trash, and common-area upkeep. Landlord may adjust the building services fee on thirty (30) days' notice to reflect actual costs.

5. USE AND OCCUPANCY. The Premises shall be occupied only by the persons named above. Overnight guests may stay no more than seven (7) nights in any thirty-day period without Landlord's written consent. Pets are not permitted. Violation of this section is a material breach.

6. MAINTENANCE AND REPAIRS. Tenant shall keep the Premises clean and in good condition and shall pay for any repair of damage caused by Tenant, guests, or pets, regardless of fault. Tenant shall report maintenance issues in writing through the online portal. Landlord shall make repairs within a reasonable time after written notice but is not liable for inconvenience caused by repairs or the temporary loss of any appliance or service.

7. ENTRY. Landlord may enter the Premises at any time with twelve (12) hours' notice for inspections, repairs, or to show the Premises to prospective tenants or buyers, and at any time without notice in an emergency.

8. EARLY TERMINATION. If Tenant ends this Lease before the end date for any reason, Tenant shall pay an early termination fee equal to three (3) months' rent in addition to rent due through the date Tenant vacates, and remains responsible for rent until the Premises are re-let. Landlord has no duty to re-let the Premises on a priority basis.

9. ARBITRATION AND ATTORNEY'S FEES. Any dispute arising from this Lease shall be resolved by binding arbitration in the county where Landlord's office is located. Tenant waives any right to a jury trial or class action. If Landlord prevails in any dispute, Tenant shall pay Landlord's reasonable attorney's fees and costs; if Tenant prevails, each party shall bear its own fees.

10. NOTICES. Notices to Landlord shall be sent by certified mail to 1450 Harborview Plaza, Suite 300, Portland, OR 97204. Notices to Tenant may be delivered to the Premises or emailed to priya.raman@mailbox-demo.example.

Tenant primary contact: Priya Raman, (503) 555-0172.
Signed: Priya Raman ____________  Daniel Okonkwo-Raman ____________  Thomas R. Whitfield, for Landlord ____________`,
  },
  {
    id: "denial",
    label: "Insurance denial",
    blurb: "Short · stays on-device",
    text: `Northgate Health Plans
Notice of Adverse Benefit Determination

Date: November 3, 2026
Member: Jordan A. Lindqvist
Member ID: NGH-771-302918
Claim Number: CL-2026-5509147
Member address: 94 Alder Court, Madison, WI 53703

Dear Jordan Lindqvist,

We reviewed the claim for physical therapy services provided by Lakeshore Rehabilitation Associates from August 4, 2026 through September 22, 2026 (14 visits, total billed $2,520.00). We have denied this claim.

Reason for denial: The services were determined not to be medically necessary because your plan covers a maximum of 10 physical therapy visits per calendar year without prior authorization, and no prior authorization was on file for visits 11 through 14. The first 10 visits were paid at the allowed amount. You are responsible for the remaining $720.00.

Your right to appeal: You may appeal this decision within 180 days of receiving this notice. To appeal, submit a written request to Northgate Health Plans, Appeals Department, PO Box 4410, Milwaukee, WI 53201 and include any supporting documents, such as a letter from your physician explaining why additional visits were necessary. You may request, free of charge, copies of all documents relevant to your claim. If your appeal is denied you may request an external review by an independent organization.

If you have questions call Member Services at 1-800-555-0123 or email appeals@northgate-demo.example.

Sincerely,
Dana Whitcombe
Appeals Coordinator`,
  },
];
