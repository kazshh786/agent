const {read}=require('./_read');
module.exports=(req,res)=>read(req,res,summary=>({range:summary.range,funnel:summary.funnel,definitions:summary.definitions,freshness:summary.freshness,warnings:summary.warnings}));
