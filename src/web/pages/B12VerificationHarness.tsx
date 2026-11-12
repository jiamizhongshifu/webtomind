// Temporary local verification only; removed after QA.
import {useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import {CreateSideNavSessionMenu} from '../components/image-create/CreateSideNavSessionMenu';
import '../styles/image-create.css';
import '../styles/create-studio-theme.css';
function Fixture(){
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[done,setDone]=useState(false),[calls,setCalls]=useState(0);const attempts=useRef(0);
 return <MemoryRouter><main style={{padding:24}}><h1>B12 会话删除验收</h1><output>{done?'deleted':`attempts:${calls}`}</output><p>长标题会话：图像与视频多轮创作，保留资产文件</p><CreateSideNavSessionMenu open={open} onOpenChange={v=>{setOpen(v);if(v)setError('')}} sessionTitle="长标题会话：图像与视频多轮创作，保留资产文件" label="会话更多" href="/session" copy={{open:'打开会话',delete:'删除会话',deleting:'删除中…',cancel:'取消',deleteConfirm:'会话内的所有创作轮次、提示词和结果关联记录将永久删除，无法恢复。资产库中已生成的图片和视频不会因此删除，正在进行的生成任务也不会取消。'}} deleting={busy} deleteError={error} onDelete={async()=>{if(busy)return false;setBusy(true);setError('');attempts.current++;setCalls(attempts.current);await new Promise(r=>setTimeout(r,700));setBusy(false);if(attempts.current===1){setError('暂时无法删除，请重试');return false}setDone(true);return true}} /></main></MemoryRouter>
}
export function mount(){document.getElementById('root')!.style.display='none';const el=document.createElement('div');document.body.appendChild(el);createRoot(el).render(<Fixture/>)}
