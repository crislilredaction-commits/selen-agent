import { NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

function parseEuroAmountToCents(value: string): number {
  const normalized = value
    .replace(/\s/g, "")
    .replace("€", "")
    .replace(",", ".")
    .trim();

  const amount = Number(normalized);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Montant invalide.");
  }

  return Math.round(amount * 100);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const { offerLabel, amount, prospectId, organizationName } = body ?? {};

    if (!offerLabel) {
      return NextResponse.json({ error: "Offre manquante." }, { status: 400 });
    }

    if (!amount) {
      return NextResponse.json({ error: "Montant manquant." }, { status: 400 });
    }

    const amountCents = parseEuroAmountToCents(amount);

    const paymentLink = await stripe.paymentLinks.create({
      line_items: [
        {
          price_data: {
            currency: "eur",
            unit_amount: amountCents,
            product_data: {
              name: offerLabel,
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        prospect_id: prospectId || "",
        organization_name: organizationName || "",
      },
    });

    return NextResponse.json({
      success: true,
      url: paymentLink.url,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Erreur Stripe." },
      { status: 500 },
    );
  }
}
