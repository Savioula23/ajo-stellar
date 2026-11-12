#![cfg(test)]

use super::*;
use soroban_sdk::testutils::{Address as _, Ledger};
use soroban_sdk::token::{StellarAssetClient, TokenClient};
use soroban_sdk::String;

fn code(e: Error) -> soroban_sdk::Error {
    soroban_sdk::Error::from_contract_error(e as u32)
}

const AMT: i128 = 100;
const DEP: i128 = 100;
const WEEK: u64 = 7 * 86_400;
const GRACE: u64 = 86_400;

struct T {
    env: Env,
    ajo: AjoClient<'static>,
    usdc: TokenClient<'static>,
    m: [Address; 3],
}

fn setup(draw: bool) -> (T, u32) {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(admin);
    let mint = StellarAssetClient::new(&env, &sac.address());
    let m = [Address::generate(&env), Address::generate(&env), Address::generate(&env)];
    for a in &m {
        mint.mint(a, &1_000);
    }
    let ajo = AjoClient::new(&env, &env.register(Ajo, ()));
    let usdc = TokenClient::new(&env, &sac.address());
    let s = |x: &str| String::from_str(&env, x);
    let id = ajo.create(&m[0], &s("Test circle"), &s("Ada"), &sac.address(), &AMT, &DEP, &3, &WEEK, &GRACE, &draw);
    ajo.join(&id, &m[1], &s("Bola"));
    ajo.join(&id, &m[2], &s("Chike"));
    (T { env, ajo, usdc, m }, id)
}

#[test]
fn full_round_pays_recipient() {
    let (t, id) = setup(false);
    let c = t.ajo.get(&id);
    assert_eq!(c.order, c.members, "join order without a draw");
    assert_eq!(c.order.len(), 3, "order is fixed once full");
    t.ajo.pay(&id, &t.m[1]);
    t.ajo.pay(&id, &t.m[2]);
    assert_eq!(t.ajo.payout(&id), t.m[0]);
    assert_eq!(t.usdc.balance(&t.m[0]), 1_000 - DEP + 2 * AMT);
    assert_eq!(t.ajo.get(&id).round, 1);
}

#[test]
fn rules_are_enforced() {
    let (t, id) = setup(false);
    assert_eq!(t.ajo.try_pay(&id, &t.m[0]), Err(Ok(code(Error::IsRecipient))));
    t.ajo.pay(&id, &t.m[1]);
    assert_eq!(t.ajo.try_pay(&id, &t.m[1]), Err(Ok(code(Error::AlreadyPaid))));
    assert_eq!(t.ajo.try_payout(&id), Err(Ok(code(Error::NotAllPaid))));
    let outsider = Address::generate(&t.env);
    assert_eq!(t.ajo.try_join(&id, &outsider, &String::from_str(&t.env, "Late")), Err(Ok(code(Error::Full))));
    assert_eq!(t.ajo.get(&id).names.get(t.m[1].clone()), Some(String::from_str(&t.env, "Bola")));
    assert_eq!(t.ajo.try_refund(&id, &t.m[1]), Err(Ok(code(Error::NotFinished))));
}

#[test]
fn late_member_is_covered_from_deposit() {
    let (t, id) = setup(false);
    t.ajo.pay(&id, &t.m[1]);
    assert_eq!(t.ajo.try_cover(&id, &t.m[2]), Err(Ok(code(Error::NotLateYet))));
    t.env.ledger().with_mut(|l| l.timestamp += WEEK + GRACE + 1);
    t.ajo.cover(&id, &t.m[2]);
    t.ajo.payout(&id);
    let c = t.ajo.get(&id);
    assert_eq!(c.late.get(t.m[2].clone()), Some(1));
    assert_eq!(c.deposits.get(t.m[2].clone()), Some(DEP - AMT));
    assert_eq!(t.usdc.balance(&t.m[0]), 1_000 - DEP + 2 * AMT, "recipient is made whole");
}

#[test]
fn highest_bid_takes_the_round() {
    let (t, id) = setup(false);
    let bid = 150; // between one contribution (100) and the pot (200)
    assert_eq!(t.ajo.try_bid(&id, &t.m[2], &50), Err(Ok(code(Error::BidTooLow))));
    assert_eq!(t.ajo.try_bid(&id, &t.m[0], &bid), Err(Ok(code(Error::CannotBid))));
    t.ajo.bid(&id, &t.m[2], &bid);
    t.ajo.pay(&id, &t.m[1]);
    t.ajo.pay(&id, &t.m[2]);
    assert_eq!(t.ajo.payout(&id), t.m[2]);
    // Bidder: paid 100, gets the 200 pot minus the 150 bid plus their own 100 back.
    assert_eq!(t.usdc.balance(&t.m[2]), 1_000 - DEP - AMT + (2 * AMT - bid + AMT));
    // Displaced organiser: receives the bid net of this round's 100 contribution.
    assert_eq!(t.usdc.balance(&t.m[0]), 1_000 - DEP + (bid - AMT));
    let c = t.ajo.get(&id);
    assert_eq!(c.order.get_unchecked(0), t.m[2]);
    assert_eq!(c.order.get_unchecked(2), t.m[0], "organiser moves to the bidder's seat");
    // Money in equals money out.
    assert_eq!(t.usdc.balance(&t.ajo.address), 3 * DEP);
}

#[test]
fn whole_cycle_then_deposits_come_back() {
    let (t, id) = setup(true);
    for _ in 0..3 {
        let c = t.ajo.get(&id);
        let rec = c.order.get_unchecked(c.round);
        for a in &t.m {
            if *a != rec {
                t.ajo.pay(&id, a);
            }
        }
        t.ajo.payout(&id);
    }
    for a in &t.m {
        assert_eq!(t.ajo.refund(&id, a), DEP);
        assert_eq!(t.usdc.balance(a), 1_000, "everyone ends where they started");
    }
    assert_eq!(t.ajo.get(&id).on_time.get(t.m[0].clone()), Some(2));
}
