import { db } from "./db";
import { companies, fundingRounds } from "./schema";
import { eq } from "drizzle-orm";

interface CSVRow {
  "Company Name": string;
  "GitHub Link": string;
  "Seed Date": string;
  "Seed Amount": string;
  "Seed Ext Date": string;
  "Seed Ext Amount": string;
  "Series A Date": string;
  "Series A Amount": string;
  "Series A Bridge Date": string;
  "Series A Bridge Amount": string;
  "Series B Date": string;
  "Series B Amount": string;
  "Series B-1 Date": string;
  "Series B-1 Amount": string;
  "Series C Date": string;
  "Series C Amount": string;
  "Series D Date": string;
  "Series D Amount": string;
  "Series E Date": string;
  "Series E Amount": string;
  "Series F Date": string;
  "Series F Amount": string;
  "Series G Date": string;
  "Series G Amount": string;
  "Exit State": string;
  "Exit Date": string;
}

function parseAmount(amountStr: string): number | null {
  if (!amountStr || amountStr === "") return null;

  // Remove $ and M/B suffixes, convert to number
  const cleaned = amountStr.replace(/[\$,]/g, "");
  const match = cleaned.match(/^([\d.]+)([MB]?)$/);
  if (!match || !match[1]) return null;

  const num = parseFloat(match[1]);
  const suffix = match[2];

  if (suffix === "B") return num * 1000; // Convert billions to millions
  return num;
}

function parseDate(dateStr: string): string | null {
  if (!dateStr || dateStr === "") return null;

  try {
    // Handle M/D/YY format
    const parts = dateStr.split("/");
    if (parts.length === 3) {
      const month = parts[0]!.padStart(2, "0");
      const day = parts[1]!.padStart(2, "0");
      let year = parts[2];

      // Convert 2-digit year to 4-digit
      if (year!.length === 2) {
        const yearNum = parseInt(year!);
        year = yearNum < 50 ? `20${year}` : `19${year}`;
      }

      return `${year}-${month}-${day}`;
    }
    return dateStr;
  } catch {
    return null;
  }
}

export async function importCSV(filePath: string) {
  console.log("📊 Importing CSV data...");

  const csvText = await Bun.file(filePath).text();
  const lines = csvText.split("\n");
  const headers = lines[0]!.split(",").map((h) => h.trim());

  let importedCount = 0;
  let skippedCount = 0;
  let updatedCount = 0;

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]!.trim()) continue;

    const values = lines[i]!.split(",").map((v) => v.trim());
    const row: any = {};

    headers.forEach((header, index) => {
      row[header] = values[index] || "";
    });

    if (!row["Company Name"] || !row["GitHub Link"]) {
      console.log(`⚠️ Skipping row ${i}: Missing company name or GitHub link`);
      continue;
    }

    try {
      // Check if company already exists
      const existingCompany = await db
        .select()
        .from(companies)
        .where(eq(companies.name, row["Company Name"]))
        .limit(1);

      let company;

      if (existingCompany.length > 0) {
        // Update existing company
        [company] = await db
          .update(companies)
          .set({
            githubLink: row["GitHub Link"],
            exitState: row["Exit State"] || "none",
            exitDate: parseDate(row["Exit Date"]),
          })
          .where(eq(companies.name, row["Company Name"]))
          .returning();

        // Delete existing funding rounds to avoid duplicates
        await db
          .delete(fundingRounds)
          .where(eq(fundingRounds.companyId, company!.id));

        updatedCount++;
        console.log(`🔄 Updated: ${company!.name}`);
      } else {
        // Insert new company
        [company] = await db
          .insert(companies)
          .values({
            name: row["Company Name"],
            githubLink: row["GitHub Link"],
            exitState: row["Exit State"] || "none",
            exitDate: parseDate(row["Exit Date"]),
          })
          .returning();

        importedCount++;
        console.log(`✅ Imported: ${company!.name}`);
      }

      // Insert funding rounds
      const rounds = [
        { type: "seed", date: row["Seed Date"], amount: row["Seed Amount"] },
        {
          type: "seed_ext",
          date: row["Seed Ext Date"],
          amount: row["Seed Ext Amount"],
        },
        {
          type: "series_a",
          date: row["Series A Date"],
          amount: row["Series A Amount"],
        },
        {
          type: "series_a_bridge",
          date: row["Series A Bridge Date"],
          amount: row["Series A Bridge Amount"],
        },
        {
          type: "series_b",
          date: row["Series B Date"],
          amount: row["Series B Amount"],
        },
        {
          type: "series_b_1",
          date: row["Series B-1 Date"],
          amount: row["Series B-1 Amount"],
        },
        {
          type: "series_c",
          date: row["Series C Date"],
          amount: row["Series C Amount"],
        },
        {
          type: "series_d",
          date: row["Series D Date"],
          amount: row["Series D Amount"],
        },
        {
          type: "series_e",
          date: row["Series E Date"],
          amount: row["Series E Amount"],
        },
        {
          type: "series_f",
          date: row["Series F Date"],
          amount: row["Series F Amount"],
        },
        {
          type: "series_g",
          date: row["Series G Date"],
          amount: row["Series G Amount"],
        },
      ];

      for (const round of rounds) {
        const parsedDate = parseDate(round.date);
        const parsedAmount = parseAmount(round.amount);

        if (parsedDate) {
          await db.insert(fundingRounds).values({
            companyId: company!.id,
            roundType: round.type,
            roundDate: parsedDate,
            amountUsd: parsedAmount,
          });
        }
      }
    } catch (error) {
      console.error(
        `❌ Failed to import row ${i}: ${row["Company Name"]}`,
        (error as Error).message
      );
      skippedCount++;
    }
  }

  console.log(`\n📈 Import Summary:`);
  console.log(`   ✅ New companies: ${importedCount}`);
  console.log(`   🔄 Updated companies: ${updatedCount}`);
  console.log(`   ⚠️ Skipped/Failed: ${skippedCount}`);
  console.log(`   📊 Total processed: ${importedCount + updatedCount}`);
}
