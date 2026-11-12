#![no_std]
//! Ajo: rotating savings circles with rules the network enforces.
//!
//! One contract instance hosts many circles. Each round every member except that round's
//! recipient pays `amount` into the contract; once all have paid, anyone can trigger the payout.
//! A refundable deposit taken at join backs each member: if someone misses a payment past the
//! grace period, anyone can `cover` it from their deposit, so the recipient is never left short.
//! A member waiting for a later seat can bid to take the current round early, paying the bid
//! to the member they jump ahead of.
use soroban_sdk::{contract, contracterror, contractimpl, contracttype, panic_with_error, token, Address, Env, Map, String, Vec};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    NotFound = 1,
    BadConfig = 2,
    Full = 3,
    AlreadyMember = 4,
    NotMember = 5,
    NotStarted = 6,
    Finished = 7,
    AlreadyPaid = 8,
    IsRecipient = 9,
    NotAllPaid = 10,
    NotLateYet = 11,
    DepositTooSmall = 12,
    NotFinished = 13,
    BidTooLow = 14,
    CannotBid = 15,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Circle {
    pub name: String,
    pub names: Map<Address, String>, // display names chosen at join
    pub organizer: Address,
    pub token: Address,
    pub amount: i128,
    pub deposit: i128,
    pub size: u32,
    pub period: u64,
    pub grace: u64,
    pub draw: bool,
    pub members: Vec<Address>, // join order
    pub order: Vec<Address>,   // payout order, fixed when the last seat fills
    pub start: u64,            // when the last seat filled
    pub round: u32,
    pub paid: Vec<Address>,    // who has paid the current round
    pub deposits: Map<Address, i128>,
    pub on_time: Map<Address, u32>,
    pub late: Map<Address, u32>,
    pub bidder: Option<Address>,
    pub bid: i128,
}

#[contracttype]
enum Key {
    Next,
    Circle(u32),
}

#[contract]
pub struct Ajo;

fn load(env: &Env, id: u32) -> Circle {
    env.storage().persistent().get(&Key::Circle(id)).unwrap_or_else(|| panic_with_error!(env, Error::NotFound))
}

fn save(env: &Env, id: u32, c: &Circle) {
    let key = Key::Circle(id);
    env.storage().persistent().set(&key, c);
    let max = env.storage().max_ttl();
    env.storage().persistent().extend_ttl(&key, max / 2, max);
}

fn bump(m: &mut Map<Address, u32>, who: &Address) {
    m.set(who.clone(), m.get(who.clone()).unwrap_or(0) + 1);
}

fn pull(env: &Env, c: &Circle, from: &Address, amount: i128) {
    token::Client::new(env, &c.token).transfer(from, &env.current_contract_address(), &amount);
}

fn push(env: &Env, c: &Circle, to: &Address, amount: i128) {
    if amount > 0 {
        token::Client::new(env, &c.token).transfer(&env.current_contract_address(), to, &amount);
    }
}

fn seat(env: &Env, c: &Circle, member: &Address) {
    if c.members.contains(member) {
        panic_with_error!(env, Error::AlreadyMember);
    }
    if c.members.len() >= c.size {
        panic_with_error!(env, Error::Full);
    }
}

/// Fill the circle: fix payout order (join order or a shuffle) and start the clock.
fn start_if_full(env: &Env, c: &mut Circle) {
    if c.members.len() < c.size {
        return;
    }
    let mut order = c.members.clone();
    if c.draw {
        // Fisher-Yates with the host PRNG, seeded by the network for this transaction.
        let n = order.len();
        for i in (1..n).rev() {
            let j = env.prng().gen_range::<u64>(0..=(i as u64)) as u32;
            let (a, b) = (order.get_unchecked(i), order.get_unchecked(j));
            order.set(i, b);
            order.set(j, a);
        }
    }
    c.order = order;
    c.start = env.ledger().timestamp();
}

fn due(c: &Circle) -> u64 {
    c.start + (c.round as u64 + 1) * c.period
}

fn active(env: &Env, c: &Circle) {
    if c.order.is_empty() {
        panic_with_error!(env, Error::NotStarted);
    }
    if c.round >= c.size {
        panic_with_error!(env, Error::Finished);
    }
}

#[contractimpl]
impl Ajo {
    /// Create a circle. The organiser takes the first seat and pays their deposit.
    #[allow(clippy::too_many_arguments)]
    pub fn create(
        env: Env, organizer: Address, name: String, organizer_name: String, token: Address, amount: i128, deposit: i128,
        size: u32, period: u64, grace: u64, draw: bool,
    ) -> u32 {
        organizer.require_auth();
        if amount <= 0 || deposit < 0 || !(2..=24).contains(&size) || period == 0 || name.len() > 40 || organizer_name.len() > 32 {
            panic_with_error!(&env, Error::BadConfig);
        }
        let id: u32 = env.storage().instance().get(&Key::Next).unwrap_or(0);
        env.storage().instance().set(&Key::Next, &(id + 1));
        let mut c = Circle {
            name, names: Map::from_array(&env, [(organizer.clone(), organizer_name)]),
            organizer: organizer.clone(), token, amount, deposit, size, period, grace, draw,
            members: Vec::from_array(&env, [organizer.clone()]), order: Vec::new(&env), start: 0, round: 0,
            paid: Vec::new(&env), deposits: Map::new(&env), on_time: Map::new(&env), late: Map::new(&env),
            bidder: None, bid: 0,
        };
        pull(&env, &c, &organizer, deposit);
        c.deposits.set(organizer, deposit);
        save(&env, id, &c);
        id
    }

    pub fn join(env: Env, id: u32, member: Address, name: String) {
        member.require_auth();
        let mut c = load(&env, id);
        seat(&env, &c, &member);
        if name.len() > 32 {
            panic_with_error!(&env, Error::BadConfig);
        }
        c.names.set(member.clone(), name);
        pull(&env, &c, &member, c.deposit);
        c.deposits.set(member.clone(), c.deposit);
        c.members.push_back(member);
        start_if_full(&env, &mut c);
        save(&env, id, &c);
    }

    pub fn pay(env: Env, id: u32, member: Address) {
        member.require_auth();
        let mut c = load(&env, id);
        active(&env, &c);
        if !c.members.contains(&member) {
            panic_with_error!(&env, Error::NotMember);
        }
        if Self::recipient_of(&c) == member {
            panic_with_error!(&env, Error::IsRecipient);
        }
        if c.paid.contains(&member) {
            panic_with_error!(&env, Error::AlreadyPaid);
        }
        pull(&env, &c, &member, c.amount);
        if env.ledger().timestamp() > due(&c) { bump(&mut c.late, &member) } else { bump(&mut c.on_time, &member) }
        c.paid.push_back(member);
        save(&env, id, &c);
    }

    /// After the grace period, anyone can pay a missing member's share from their deposit.
    pub fn cover(env: Env, id: u32, member: Address) {
        let mut c = load(&env, id);
        active(&env, &c);
        if !c.members.contains(&member) {
            panic_with_error!(&env, Error::NotMember);
        }
        if Self::recipient_of(&c) == member {
            panic_with_error!(&env, Error::IsRecipient);
        }
        if c.paid.contains(&member) {
            panic_with_error!(&env, Error::AlreadyPaid);
        }
        if env.ledger().timestamp() <= due(&c) + c.grace {
            panic_with_error!(&env, Error::NotLateYet);
        }
        let left = c.deposits.get(member.clone()).unwrap_or(0);
        if left < c.amount {
            panic_with_error!(&env, Error::DepositTooSmall);
        }
        c.deposits.set(member.clone(), left - c.amount);
        bump(&mut c.late, &member);
        c.paid.push_back(member);
        save(&env, id, &c);
    }

    /// Bid to take the current round's pot early. The highest bid wins at payout; the winner
    /// receives the pot minus the bid and the displaced recipient receives the bid.
    pub fn bid(env: Env, id: u32, member: Address, amount: i128) {
        member.require_auth();
        let mut c = load(&env, id);
        active(&env, &c);
        let pos = c.order.first_index_of(&member).unwrap_or_else(|| panic_with_error!(&env, Error::NotMember));
        if pos <= c.round {
            panic_with_error!(&env, Error::CannotBid); // already received, or is the current recipient
        }
        // At least one contribution, because the displaced recipient's share for this round is netted from it.
        if amount <= c.bid || amount < c.amount || amount >= c.amount * (c.size as i128 - 1) {
            panic_with_error!(&env, Error::BidTooLow);
        }
        c.bidder = Some(member);
        c.bid = amount;
        save(&env, id, &c);
    }

    /// Release the pot once everyone has paid. Permissionless: funds can only go to the right seat.
    pub fn payout(env: Env, id: u32) -> Address {
        let mut c = load(&env, id);
        active(&env, &c);
        if c.paid.len() < c.size - 1 {
            panic_with_error!(&env, Error::NotAllPaid);
        }
        let pot = c.amount * (c.size as i128 - 1);
        let scheduled = Self::recipient_of(&c);
        let winner = match c.bidder.clone() {
            Some(b) => {
                // Swap seats: the bidder takes this round, the scheduled recipient takes the bidder's seat.
                let pos = c.order.first_index_of(&b).unwrap();
                c.order.set(c.round, b.clone());
                c.order.set(pos, scheduled.clone());
                // The bidder already paid this round as a member; they get that back with the pot.
                push(&env, &c, &b, pot - c.bid + c.amount);
                // The displaced recipient now owes this round like everyone else: net it from the bid.
                push(&env, &c, &scheduled, c.bid - c.amount);
                b
            }
            None => {
                push(&env, &c, &scheduled, pot);
                scheduled
            }
        };
        c.round += 1;
        c.paid = Vec::new(&env);
        c.bidder = None;
        c.bid = 0;
        save(&env, id, &c);
        winner
    }

    /// Once the circle has finished, return whatever is left of a member's deposit.
    pub fn refund(env: Env, id: u32, member: Address) -> i128 {
        let mut c = load(&env, id);
        if c.order.is_empty() || c.round < c.size {
            panic_with_error!(&env, Error::NotFinished);
        }
        let left = c.deposits.get(member.clone()).unwrap_or(0);
        c.deposits.set(member.clone(), 0);
        push(&env, &c, &member, left);
        save(&env, id, &c);
        left
    }

    pub fn get(env: Env, id: u32) -> Circle {
        load(&env, id)
    }

    pub fn count(env: Env) -> u32 {
        env.storage().instance().get(&Key::Next).unwrap_or(0)
    }
}

impl Ajo {
    fn recipient_of(c: &Circle) -> Address {
        c.order.get_unchecked(c.round)
    }
}

mod test;
