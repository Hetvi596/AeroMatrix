import character from '../assets/avatar/aerosage.svg';
import type {AvatarState} from '../types';
export function AeroSageAvatar({state='idle',compact=false}:{state?:AvatarState;compact?:boolean}){
  return <div className={`as-avatar ${compact?'as-avatar--compact':''}`} data-state={state} role="img" aria-label={`AeroSage, ${state}`}>
    <div className="as-orbit"/><img src={character} alt="" width="400" height="400" draggable={false}/>
    <span className="as-mouth" aria-hidden="true"/>
    <div className="as-avatar-status"><i/>{({idle:'READY TO EXPLORE',listening:'LISTENING',thinking:'CONNECTING THE DOTS',speaking:'SPEAKING',happy:'READY FOR WHAT’S NEXT',error:'LET’S RECONNECT'})[state]}</div>
  </div>;
}
