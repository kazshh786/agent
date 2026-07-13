/**
 * KS Unified Dashboard - Social Media Mock Database
 * Preloaded datasets for demoing scheduling, calendar interactions, inbox replies,
 * analytics reporting, and competitor benchmarking.
 */

const KSSocialMockData = {
  activeBrand: "Kasim Shah Agency",
  
  brands: [
    { id: "kasim-agency", name: "Kasim Shah Agency" },
    { id: "kasim-personal", name: "Kasim Shah Personal" }
  ],
  
  socialAccounts: [
    { id: "acc-1", platform: "instagram", handle: "@kasimshah.dev", name: "Kasim Shah", avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80", status: "connected", followers: "24,800", weeklyChange: "+5.2%" },
    { id: "acc-2", platform: "twitter", handle: "@kasimshah_dev", name: "Kasim Shah", avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80", status: "connected", followers: "12,400", weeklyChange: "+8.7%" },
    { id: "acc-3", platform: "linkedin", handle: "in/kasim-shah", name: "Kasim Shah", avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80", status: "connected", followers: "5,920", weeklyChange: "+2.1%" },
    { id: "acc-4", platform: "tiktok", handle: "@kasim_tech", name: "Kasim Tech", avatar: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80", status: "connected", followers: "48,200", weeklyChange: "+14.3%" },
    { id: "acc-5", platform: "pinterest", handle: "@kasim_designs", name: "Kasim Designs", avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80", status: "connected", followers: "3,150", weeklyChange: "+0.5%" },
    { id: "acc-6", platform: "facebook", handle: "/kasimshah.official", name: "Kasim Shah Official", avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80", status: "disconnected", followers: "1,200", weeklyChange: "0.0%" },
    { id: "acc-7", platform: "youtube", handle: "@KasimShahDev", name: "Kasim Shah Dev", avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80", status: "connected", followers: "18,900", weeklyChange: "+6.8%" }
  ],
  
  scheduledPosts: [
    {
      id: "post-101",
      platforms: ["twitter", "linkedin"],
      content: "Building KS Social Auto, a unified social media automation dashboard! Automating cross-channel posts, tracking growth, and incorporating AI post assistants. Built with raw performance in mind. 🚀 #SaaS #BuildInPublic #IndieHacker",
      mediaType: "image",
      mediaUrl: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80",
      scheduleDate: "2026-07-13T10:00:00",
      status: "scheduled"
    },
    {
      id: "post-102",
      platforms: ["instagram", "tiktok"],
      content: "Consistency beats intensity. The key to social growth is planning. Here is how I automate a week of content in less than 2 hours every Sunday. 👇",
      mediaType: "image",
      mediaUrl: "https://images.unsplash.com/photo-1488190211105-8b0e65b80b4e?w=600&auto=format&fit=crop&q=80",
      scheduleDate: "2026-07-14T14:30:00",
      status: "scheduled"
    },
    {
      id: "post-103",
      platforms: ["linkedin"],
      content: "Deeply honored to join the Advanced Agentic Coding community. We are entering an era where AI doesn't just assist, but pairs alongside us to orchestrate complex architectural designs. What's your take on AI-augmented engineering? Let me know below.",
      mediaType: "none",
      mediaUrl: "",
      scheduleDate: "2026-07-15T09:15:00",
      status: "scheduled"
    },
    {
      id: "post-104",
      platforms: ["pinterest"],
      content: "Aesthetic office setup ideas. Dark mode, ambient neon lights, and minimalist desk mats. Perfect workspace motivation! ✨💻",
      mediaType: "image",
      mediaUrl: "https://images.unsplash.com/photo-1547082299-de196ea013d6?w=600&auto=format&fit=crop&q=80",
      scheduleDate: "2026-07-16T18:00:00",
      status: "scheduled"
    },
    {
      id: "post-105",
      platforms: ["instagram", "twitter", "facebook"],
      content: "Launch day is finalized! KS Social Auto officially enters beta next week. Get ready to simplify, measure, and scale your social reach. Sign up link in bio. 🎯",
      mediaType: "image",
      mediaUrl: "https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?w=600&auto=format&fit=crop&q=80",
      scheduleDate: "2026-07-17T12:00:00",
      status: "scheduled"
    },
    {
      id: "post-100",
      platforms: ["twitter", "linkedin"],
      content: "Social media shouldn't take 40 hours a week. Plan smart, create queues, schedule in advance, and let the dashboard handle execution. Focus on coding instead! 💻🔥",
      mediaType: "none",
      mediaUrl: "",
      scheduleDate: "2026-07-12T15:00:00",
      status: "published",
      engagement: { likes: 142, retweets: 24, replies: 12, impressions: 5800 }
    },
    {
      id: "post-99",
      platforms: ["instagram"],
      content: "Focus on the process, not just the outcome. Crafting interfaces that look premium and function flawlessly. 💎",
      mediaType: "image",
      mediaUrl: "https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?w=600&auto=format&fit=crop&q=80",
      scheduleDate: "2026-07-11T16:20:00",
      status: "published",
      engagement: { likes: 382, retweets: 0, replies: 28, impressions: 9400 }
    }
  ],
  
  inboxMessages: [
    {
      id: "msg-1",
      platform: "instagram",
      type: "comment",
      sender: "sarah_k",
      senderAvatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&auto=format&fit=crop&q=80",
      content: "This dashboard looks incredibly clean! Is there a beta link I can join?",
      timestamp: "2026-07-12T20:45:00",
      unread: true,
      thread: [
        { sender: "sarah_k", role: "user", text: "This dashboard looks incredibly clean! Is there a beta link I can join?", time: "8:45 PM" }
      ]
    },
    {
      id: "msg-2",
      platform: "twitter",
      type: "dm",
      sender: "Alex Rivers",
      senderAvatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&auto=format&fit=crop&q=80",
      content: "Hey Kasim! Saw your post about AI post generation. Does it support custom tone templates for brand alignment?",
      timestamp: "2026-07-12T19:30:00",
      unread: true,
      thread: [
        { sender: "Alex Rivers", role: "user", text: "Hey Kasim! Saw your post about AI post generation. Does it support custom tone templates for brand alignment?", time: "7:30 PM" }
      ]
    },
    {
      id: "msg-3",
      platform: "linkedin",
      type: "mention",
      sender: "Dr. Rachel Evans",
      senderAvatar: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=100&auto=format&fit=crop&q=80",
      content: "Thoroughly enjoying the insights shared by @Kasim Shah on AI-augmented engineering. Highly recommend following his build log.",
      timestamp: "2026-07-12T18:15:00",
      unread: false,
      thread: [
        { sender: "Dr. Rachel Evans", role: "user", text: "Thoroughly enjoying the insights shared by @Kasim Shah on AI-augmented engineering. Highly recommend following his build log.", time: "6:15 PM" },
        { sender: "Kasim Shah", role: "agent", text: "Thank you so much Rachel! Really appreciate the kind words. More updates coming soon.", time: "6:40 PM" }
      ]
    },
    {
      id: "msg-4",
      platform: "tiktok",
      type: "comment",
      sender: "tech_guru",
      senderAvatar: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&auto=format&fit=crop&q=80",
      content: "Sick UI bro! What charting library did you use for the analytics?",
      timestamp: "2026-07-11T23:05:00",
      unread: false,
      thread: [
        { sender: "tech_guru", role: "user", text: "Sick UI bro! What charting library did you use for the analytics?", time: "11:05 PM (Yesterday)" }
      ]
    },
    {
      id: "msg-5",
      platform: "twitter",
      type: "mention",
      sender: "WebDev Weekly",
      senderAvatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100&auto=format&fit=crop&q=80",
      content: "New SaaS alert! @kasimshah_dev is building a complete SocialPilot and Later competitor from scratch. Check it out.",
      timestamp: "2026-07-11T12:00:00",
      unread: false,
      thread: [
        { sender: "WebDev Weekly", role: "user", text: "New SaaS alert! @kasimshah_dev is building a complete SocialPilot and Later competitor from scratch. Check it out.", time: "12:00 PM (Yesterday)" },
        { sender: "Kasim Shah", role: "agent", text: "Thanks for the shoutout! 🔥", time: "12:15 PM (Yesterday)" }
      ]
    }
  ],
  
  analytics: {
    followerOverview: {
      total: "126,370",
      change: "+7.4% this month",
      labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul"],
      instagram: [12000, 14200, 16800, 19100, 21300, 23100, 24800],
      twitter: [8100, 8900, 9600, 10200, 11000, 11700, 12400],
      tiktok: [15000, 22000, 29000, 34000, 39000, 44000, 48200],
      linkedin: [3100, 3600, 4000, 4500, 5000, 5500, 5920]
    },
    engagementRates: {
      labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      rates: [4.2, 5.8, 6.1, 5.4, 7.2, 6.8, 5.1]
    },
    impressions: {
      labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      values: [12000, 15000, 18200, 16900, 24000, 21500, 14000]
    },
    bestTimes: [
      { day: "Wednesday", time: "11:00 AM", score: "High Engagement" },
      { day: "Friday", time: "4:00 PM", score: "High Reach" },
      { day: "Monday", time: "3:00 PM", score: "Moderate Reach" },
      { day: "Thursday", time: "9:00 AM", score: "High Replies" }
    ],
    competitors: [
      { name: "BufferCorp", followers: "145,000", postsPerWeek: 14, avgEngagement: "3.2%", status: "behind" },
      { name: "LaterElite", followers: "320,000", postsPerWeek: 21, avgEngagement: "2.1%", status: "ahead" },
      { name: "Kasim Shah Agency (You)", followers: "126,370", postsPerWeek: 12, avgEngagement: "5.8%", status: "leading_engagement" },
      { name: "SocialPilotLite", followers: "92,000", postsPerWeek: 8, avgEngagement: "4.1%", status: "leading_growth" }
    ]
  },
  
  aiCredits: 450,
  maxAiCredits: 500
};

// Export globally
if (typeof window !== 'undefined') {
  window.KSSocialMockData = KSSocialMockData;
}
if (typeof module !== 'undefined') {
  module.exports = KSSocialMockData;
}
