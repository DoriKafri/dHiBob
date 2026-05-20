# Home Social Hub Design (HiBob Clone)

## Overview
A high-fidelity social "Home" experience that transforms the dashboard into a personalized, two-column workspace. It combines system-generated events (New Joiners, Birthdays) with manual peer recognition (Shoutouts).

## Architecture & UI Layout
- **"The Bob Split" Layout**:
  - **Central Feed (Main Column)**: A scrollable timeline of `FeedCard` components.
  - **Personal Sidebar**: A stack of widgets: `MeWidget` (PTO/Holidays), `TeamWidget` (Who's In/Out), and `TasksWidget`.
- **Feed Card Variants**:
  - `NewJoinerCard`: Large avatar, welcome message, job title/department.
  - `CelebrationCard`: Birthday/Anniversary specific styling with festive badges.
  - `ShoutoutCard`: Manual peer recognition text with author/recipient info.

## Data Flow & Backend
1. **Aggregator Query (`home.getFeed`)**: A tRPC query that merges data from:
   - `Employee`: Filtering for recent `startDate` (New Joiners) and upcoming `birthday`/`anniversary`.
   - `Post`: A new table for manual `SHOUTOUT` events.
2. **Hybrid Liveness**:
   - **Polling**: Background data (Birthdays/Anniversaries) is refreshed on load.
   - **Real-Time**: Manual Shoutouts use a hybrid approach (ready for WebSockets/Pusher integration) to appear "live" in the feed.
3. **Multi-Tenant Scoping**: Every query is strictly filtered by `ctx.user.companyId`.

## New Schema (Post Table)
```prisma
model Post {
  id          String   @id @default(cuid())
  type        String   @default("SHOUTOUT")
  content     String
  authorId    String
  targetId    String?  // Recipient of the shoutout
  companyId   String
  createdAt   DateTime @default(now())
  author      Employee @relation("AuthorPosts", fields: [authorId], references: [id])
  target      Employee? @relation("TargetPosts", fields: [targetId], references: [id])
  @@index([companyId])
}
```

## Testing & Validation
- **Integration Tests**: Verify `home.getFeed` correctly merges disparate data sources into a chronological list.
- **UI Tests**: Ensure `FeedCard` renders the correct variant based on the event type payload.
- **Privacy Tests**: Confirm no sensitive employee data (salary, performance) ever appears in the feed.
