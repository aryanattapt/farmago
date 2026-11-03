import { useEffect, useState } from 'react'
import { ArrowRight, LockKeyhole, Plus, X } from 'lucide-react'
import { api } from '../../shared/api/client.js'

export function AuthModal({ mode, setMode, onClose, onAuthenticated, onToast }) {
  const [values, setValues] = useState({ name:'',contact:'',password:'',phone:'' })
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [devUrl,setDevUrl]=useState('')
  const [mfaRequired,setMfaRequired]=useState(false)
  const [mfaCode,setMfaCode]=useState('')
  const [noticeSuccess,setNoticeSuccess]=useState(false)
  useEffect(()=>{if(new URLSearchParams(location.search).has('reset'))setMode('reset')},[])
  const update=(key,value)=>setValues((current)=>({...current,[key]:value}))
  const submit=async(e)=>{
    e.preventDefault();setBusy(true);setError('');setNoticeSuccess(false)
    try{
      if(mode==='register'){
        const email=values.contact.includes('@')?values.contact:undefined
        const phone=values.phone||(!email?values.contact:undefined)
        const result=await api('/auth/register',{method:'POST',body:JSON.stringify({name:values.name,email,phone,password:values.password})})
        setDevUrl(result.verificationUrl||'');setError(result.message);setNoticeSuccess(true)
      }else if(mode==='forgot'){
        const result=await api('/auth/password-reset',{method:'POST',body:JSON.stringify({contact:values.contact})})
        setDevUrl(result.resetUrl||'');setError(result.message);setNoticeSuccess(true)
      }else if(mode==='reset'){
        const token=new URLSearchParams(location.search).get('reset')
        if(!token) throw new Error('Tautan pemulihan tidak valid.')
        const result=await api('/auth/password-reset',{method:'POST',body:JSON.stringify({token,newPassword:values.password})})
        setError(result.message);setNoticeSuccess(true);setMode('login');history.replaceState({},'',location.pathname)
      }else{
        const result=await api('/auth/login',{method:'POST',body:JSON.stringify({contact:values.contact,password:values.password,mfaCode})})
        onAuthenticated(result.user)
      }
    }catch(err){if(err.code==='MFA_REQUIRED')setMfaRequired(true);setError(err.message)}finally{setBusy(false)}
  }
  const title=mode==='register'?'Buat akun baru':mode==='forgot'?'Lupa kata sandi?':mode==='reset'?'Buat kata sandi baru':'Selamat datang kembali'
  return <div className="overlay auth-overlay" onMouseDown={(e)=>e.target===e.currentTarget&&onClose()}><section className="auth-card"><button className="close-button auth-close" onClick={onClose}><X/></button><div className="auth-brand"><span className="brand-mark"><Plus size={20}/></span></div><div className="eyebrow centered">FARMAGO</div><h2>{title}</h2><p className="auth-subtitle">{mode==='forgot'?'Jika email cocok, kami akan mengirim tautan reset.':mode==='reset'?'Gunakan tautan dari email untuk membuat kata sandi baru.':mode==='register'?'Daftar untuk mulai berbelanja dan memantau pesananmu.':'Masuk untuk melanjutkan perjalanan sehatmu.'}</p>
    <form onSubmit={submit} className="auth-form">{mode==='register'&&<label>Nama lengkap<input required value={values.name} onChange={(e)=>update('name',e.target.value)} placeholder="Nama sesuai identitas" minLength="2" /></label>}<label>{mode==='forgot'?'Email akun':'Email atau nomor telepon'}<input required type={mode==='forgot'?'email':'text'} autoComplete={mode==='forgot'?'email':'username'} value={values.contact} onChange={(e)=>update('contact',e.target.value)} placeholder={mode==='forgot'?'nama@email.com':'nama@email.com atau +62...'} /></label>{mode==='register'&&!values.contact.includes('@')&&<label>Nomor telepon<input value={values.phone} onChange={(e)=>update('phone',e.target.value)} placeholder="+62 812 ..." /></label>}{mode!=='forgot'&&<label>Kata sandi<input required type="password" minLength="12" autoComplete={mode==='register'?'new-password':'current-password'} value={values.password} onChange={(e)=>update('password',e.target.value)} placeholder="Minimal 12 karakter" /></label>}{mode==='login'&&mfaRequired&&<label>Kode autentikator<input required inputMode="numeric" autoComplete="one-time-code" value={mfaCode} onChange={(e)=>setMfaCode(e.target.value)} placeholder="6 digit atau kode pemulihan" /></label>}{mode==='login'&&<button type="button" className="forgot-link" onClick={()=>{setError('');setMode('forgot')}}>Lupa kata sandi?</button>}{error&&<div className={noticeSuccess?'form-success':'form-error'}>{error}{devUrl&&<a href={devUrl}>Buka tautan</a>}</div>}<button className="button button-dark full-width" disabled={busy}>{busy?'Mohon tunggu...':mode==='register'?'Buat akun':mode==='forgot'?'Kirim petunjuk':mode==='reset'?'Simpan kata sandi':'Masuk'} <ArrowRight size={17}/></button></form>
    {mode==='login'?<p className="auth-switch">Belum punya akun? <button onClick={()=>{setError('');setDevUrl('');setMode('register')}}>Daftar sekarang</button></p>:mode==='register'?<p className="auth-switch">Sudah punya akun? <button onClick={()=>{setError('');setDevUrl('');setMode('login')}}>Masuk</button></p>:<p className="auth-switch"><button onClick={()=>setMode('login')}>Kembali ke halaman masuk</button></p>}
    <div className="auth-privacy"><LockKeyhole size={13}/> Data kesehatanmu hanya dapat diakses sesuai kewenangan.</div>
  </section></div>
}
