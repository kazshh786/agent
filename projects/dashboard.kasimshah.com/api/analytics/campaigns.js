const {read}=require('./_read');
module.exports=(req,res)=>read(req,res,summary=>({range:summary.range,campaigns:summary.campaigns,futureChannels:summary.futureChannels,spendDataAvailable:false,roas:null,freshness:summary.freshness,warnings:summary.warnings}));
