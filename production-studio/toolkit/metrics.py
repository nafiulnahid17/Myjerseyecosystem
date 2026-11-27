"""sRGB-to-Lab, CIEDE2000 and local-window structural similarity."""
import numpy as np
from scipy import ndimage as nd


def as_lab(im):
    im = np.asarray(im, np.float32)/255
    linear = np.where(im <= .04045, im/12.92, ((im+.055)/1.055)**2.4)
    matrix = np.array([[.4124564,.3575761,.1804375],
                       [.2126729,.7151522,.0721750],
                       [.0193339,.1191920,.9503041]], np.float32)
    xyz = (linear @ matrix.T)/np.array([.95047,1.,1.08883], np.float32)
    c = 6/29
    t = np.where(xyz>c**3, np.cbrt(xyz), xyz/(3*c*c)+4/29)
    return np.stack((116*t[...,1]-16,
                     500*(t[...,0]-t[...,1]),
                     200*(t[...,1]-t[...,2])), axis=-1)


def delta_e(a, b):
    L1,a1,b1 = a.transpose(2,0,1); L2,a2,b2 = b.transpose(2,0,1)
    c1 = np.hypot(a1,b1); c2 = np.hypot(a2,b2); cm = .5*(c1+c2)
    g = .5*(1-np.sqrt(cm**7/(cm**7+25**7)))
    A1 = (1+g)*a1; A2 = (1+g)*a2
    C1 = np.hypot(A1,b1); C2 = np.hypot(A2,b2)
    H1 = np.arctan2(b1,A1)%(2*np.pi)
    H2 = np.arctan2(b2,A2)%(2*np.pi)
    different = C1*C2 != 0
    dH = H2-H1
    dH = np.where(different, (dH+np.pi)%(2*np.pi)-np.pi, 0)
    mH = .5*(H1+H2)
    mH = np.where(different, np.where(abs(H1-H2)>np.pi,(mH+np.pi)%(2*np.pi),mH), H1+H2)
    t = 1-.17*np.cos(mH-np.deg2rad(30))+.24*np.cos(2*mH)+.32*np.cos(3*mH+np.deg2rad(6))-.20*np.cos(4*mH-np.deg2rad(63))
    mL = .5*(L1+L2); mC = .5*(C1+C2)
    sL = 1+.015*(mL-50)**2/np.sqrt(20+(mL-50)**2)
    sC = 1+.045*mC
    sH = 1+.015*mC*t
    rC = 2*np.sqrt(mC**7/(mC**7+25**7))
    rt = -rC*np.sin(np.deg2rad(60)*np.exp(-((np.rad2deg(mH)-275)/25)**2))
    qL = (L2-L1)/sL; qC = (C2-C1)/sC
    qH = (2*np.sqrt(C1*C2)*np.sin(.5*dH))/sH
    return np.sqrt(np.maximum(qL*qL+qC*qC+qH*qH+rt*qC*qH,0))


def ssim(a, b, channels=False):
    a = a.astype(np.float32); b = b.astype(np.float32)
    f = lambda z: nd.gaussian_filter(z, (1.5,1.5,0) if z.ndim == 3 else (1.5,1.5),
                                     truncate=10/3, mode='reflect')
    mu1 = f(a); mu2 = f(b)
    v1 = f(a*a)-mu1*mu1; v2 = f(b*b)-mu2*mu2; co = f(a*b)-mu1*mu2
    c1 = (255*.01)**2; c2 = (255*.03)**2
    result = (2*mu1*mu2+c1)*(2*co+c2)/((mu1**2+mu2**2+c1)*(v1+v2+c2))
    return float(result[5:-5,5:-5].mean())
