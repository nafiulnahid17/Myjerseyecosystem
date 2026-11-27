#include <algorithm>
#include <cmath>
#include <cstdint>

struct Vec {
    double x, y;
    Vec operator-(Vec q) const { return {x-q.x, y-q.y}; }
};
static double dot(Vec p, Vec q) { return p.x*q.x + p.y*q.y; }
static double cross(Vec p, Vec q) { return p.x*q.y - p.y*q.x; }

static Vec end_of(const double *c) {
    return c[0] == 2.0 ? Vec{c[5], c[6]} : Vec{c[1], c[2]};
}

extern "C" int simplify_path(const double *paths, int n, double eps, int *indexes, uint8_t *lines) {
    int out=0;
    for (int i=1;i<n;) {
        Vec p=end_of(paths+7*(i-1));
        int best=i;
        bool convert=false;
        int misses=0;
        double walk=0;
        Vec last=p;
        for (int j=i;j<std::min(n,i+240);++j) {
            Vec e=end_of(paths+7*j);
            Vec chord=e-p;
            double norm2=dot(chord,chord);
            Vec jump=e-last;
            walk+=std::sqrt(dot(jump,jump));
            last=e;
            if (norm2 < 1.e-8) {
                if (++misses==5) break;
                continue;
            }
            double len=std::sqrt(norm2);
            double test=eps*len;
            double extent=std::min(.16,eps*.30)*len;
            bool okay=walk<len*1.035+eps*.8;
            double furthest=0;
            for (int k=i;k<=j && okay;++k) {
                const double *c=paths+7*k;
                int pcount=c[0]==2.0 ? 3 : 1;
                for (int l=0;l<pcount;++l) {
                    Vec v=Vec{c[1+2*l],c[2+2*l]}-p;
                    double projection=dot(v,chord);
                    if (std::abs(cross(chord,v))>test || projection<-extent ||
                        projection>norm2+extent || projection<furthest-extent) {
                        okay=false;
                        break;
                    }
                    furthest=std::max(furthest,projection);
                }
            }
            if (okay) {
                best=j;
                convert=true;
                misses=0;
            } else if (++misses==5) break;
        }
        indexes[out]=best;
        lines[out]=convert;
        ++out;
        i=best+1;
    }
    return out;
}
