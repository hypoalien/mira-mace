import { z } from "zod";

export const patientDetailsSchema = z.object({
  address: z.string().trim().min(1),
  phone: z.string().trim().min(1),
  contactDetails: z.string().trim().min(1),
  deliveryAddress: z.string().trim().min(1),
  homeAccessibility: z.string().trim().min(1),
  mobilityNeeds: z.string().trim().min(1),
  caregiverSupport: z.string().trim().min(1),
});
