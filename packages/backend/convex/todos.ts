import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getIdentityOrThrow } from "./auth";

export const getAll = query({
	handler: async (ctx) => {
		await getIdentityOrThrow(ctx);
		return await ctx.db.query("todos").collect();
	},
});

export const create = mutation({
	args: {
		text: v.string(),
	},
	handler: async (ctx, args) => {
		await getIdentityOrThrow(ctx);
		const newTodoId = await ctx.db.insert("todos", {
			text: args.text,
			completed: false,
		});
		return await ctx.db.get(newTodoId);
	},
});

export const toggle = mutation({
	args: {
		id: v.id("todos"),
		completed: v.boolean(),
	},
	handler: async (ctx, args) => {
		await getIdentityOrThrow(ctx);
		await ctx.db.patch(args.id, { completed: args.completed });
		return { success: true };
	},
});

export const deleteTodo = mutation({
	args: {
		id: v.id("todos"),
	},
	handler: async (ctx, args) => {
		await getIdentityOrThrow(ctx);
		await ctx.db.delete(args.id);
		return { success: true };
	},
});
