import { describe, it, expect } from "vitest";
import { ITEM_IMPORT_ROW_CAP, ITEM_TEMPLATE_CSV, moneyToCents, parseItemCsv } from "../itemImport";

describe("moneyToCents", () => {
  it("reads plain dollar amounts and rejects anything else", () => {
    expect(moneyToCents("$1,250.50")).toBe(125050);
    expect(moneyToCents("100")).toBe(10000);
    expect(moneyToCents("0")).toBe(0);
    expect(moneyToCents("12.345")).toBeNull();
    expect(moneyToCents("-5")).toBeNull();
    expect(moneyToCents("ten")).toBeNull();
    expect(moneyToCents("")).toBeNull();
  });
});

describe("parseItemCsv", () => {
  it("accepts the downloadable template as it is", () => {
    const { rows, errors } = parseItemCsv(ITEM_TEMPLATE_CSV);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ title: "Weekend Cabin Getaway", startingBidCents: 10000, minIncrementCents: 1000, fairMarketValueCents: 30000, donatedBy: "Smith Family", category: "Experiences" });
  });
  it("understands different column names, a BOM, quotes and a default raise", () => {
    const csv = '﻿Item Name,Details,Opening Bid,FMV,Sponsor\n"Quilt, hand made","Queen size",$75,$200,"Ann ""Nana"" Lee"\n';
    const { rows, errors } = parseItemCsv(csv);
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({ title: "Quilt, hand made", description: "Queen size", startingBidCents: 7500, minIncrementCents: 500, fairMarketValueCents: 20000, donatedBy: 'Ann "Nana" Lee' });
  });
  it("names the row and the problem, and adds nothing when any row is wrong", () => {
    const csv = "title,starting bid,fair market value,photo link\nGood,50,60,\n,50,60,\nBad bid,abc,60,\nNo value,50,,\nBad photo,50,60,http://x.test/a.png\n";
    const { rows, errors } = parseItemCsv(csv);
    expect(rows.map((r) => r.title)).toEqual(["Good"]);
    expect(errors.map((e) => e.row)).toEqual([3, 4, 5, 6]);
    expect(errors[1].message).toMatch(/starting bid/);
    expect(errors[2].message).toMatch(/fair market value/);
    expect(errors[3].message).toMatch(/https/);
  });
  it("requires the three essential columns and at least one item", () => {
    expect(parseItemCsv("title,starting bid\nA,5").errors[0].message).toMatch(/fair market value/);
    expect(parseItemCsv("description\nx").errors[0].message).toMatch(/title/);
    expect(parseItemCsv("title,starting bid,fair market value").errors[0].message).toMatch(/at least one item/);
    expect(parseItemCsv("").errors.length).toBe(1);
  });
  it("refuses more rows than the cap", () => {
    const body = Array.from({ length: ITEM_IMPORT_ROW_CAP + 1 }, (_, i) => `Item ${i},10,10`).join("\n");
    expect(parseItemCsv(`title,starting bid,fair market value\n${body}`).errors[0].message).toMatch(/at most/);
  });
  it("a starting bid under $1 fails like an item typed by hand", () => {
    expect(parseItemCsv("title,starting bid,fair market value\nCheap,0.50,1").errors[0].message).toMatch(/at least \$1/);
  });
});
