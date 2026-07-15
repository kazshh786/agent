const {read}=require('./_read');
module.exports=(req,res)=>read(req,res,summary=>({range:summary.range,firstTouch:summary.firstTouch,lastTouch:summary.lastTouch,futureChannels:summary.futureChannels,spendDataAvailable:false,roas:null,freshness:summary.freshness,warnings:summary.warnings}));
