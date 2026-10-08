// Seed movements are taken from the supplied exercises-dataset project.
// The thumbnail media remains hosted by that dataset; users can add custom movements too.
export type Exercise = { id:string; name:string; category:string; target:string; equipment:string; media_id:string; image?:string; gif_url?:string; instructions?:Record<string,string>; instruction_steps?:Record<string,string[]> };
export const EXERCISES: Exercise[] = [
  {id:'EIeI8Vf',name:'Barbell Bench Press',category:'chest',target:'pectorals',equipment:'barbell',media_id:'EIeI8Vf',image:'images/0025-EIeI8Vf.jpg',gif_url:'videos/0025-EIeI8Vf.gif'},
  {id:'ila4NZS',name:'Barbell Deadlift',category:'upper legs / back',target:'glutes',equipment:'barbell',media_id:'ila4NZS',image:'images/0032-ila4NZS.jpg',gif_url:'videos/0032-ila4NZS.gif'},
  {id:'qXTaZnJ',name:'Barbell Full Squat',category:'upper legs',target:'glutes',equipment:'barbell',media_id:'qXTaZnJ',image:'images/0043-qXTaZnJ.jpg',gif_url:'videos/0043-qXTaZnJ.gif'},
  {id:'NbVPDMW',name:'Dumbbell Biceps Curl',category:'upper arms',target:'biceps',equipment:'dumbbell',media_id:'NbVPDMW'},
  {id:'lBDjFxJ',name:'Pull-up',category:'back',target:'lats',equipment:'body weight',media_id:'lBDjFxJ'},
  {id:'DsgkuIt',name:'Dumbbell Lateral Raise',category:'shoulders',target:'delts',equipment:'dumbbell',media_id:'DsgkuIt'},
];
