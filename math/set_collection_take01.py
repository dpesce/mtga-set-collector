#######################################################
# imports

import numpy as np
import matplotlib.pyplot as plt

#######################################################
# pull values from JSON file

N_C = 81
N_U = 100
N_R = 65
N_M = 22
alpha = 7.0

#######################################################
# read user inputs

c_C = 77
c_U = 55
c_R = 37
c_M = 13

#######################################################
# do some basic checks first

# make sure the quantities are all non-negative integers
if (c_C != int(c_C)) | (c_U != int(c_U)) | (c_R != int(c_R)) | (c_M != int(c_M)):
    raise Exception("All four fields must be integers (0 or higher).")

# make sure the number of collected cards does not exceed the number of cards in set
if (c_C > N_C) | (c_U > N_U) | (c_R > N_R) | (c_M > N_M):
    raise Exception("The number of owned cards of a single type must not exceed the number of cards of that type in the set.")

#######################################################
# compute the number of each card type per pack

# non-wildcards
n_C = 14.0/3.0
n_U = 9.0/5.0
n_R = (1.0 - (1.0/alpha))*(1.0 - (1.0/30.0))
n_M = (1.0/alpha)*(1.0 - (1.0/30.0))

# wildcards
w_C = 1.0/3.0
w_U = 11.0/30.0
w_R = (1.0/6.0)*(1.0 - (1.0/(5.0*alpha)))
w_M = (1.0/30.0)*(1.0 + (1.0/alpha))

#######################################################
# assign wildcard values, in units of equivalent number of packs

v_C = 1.0 / w_C
v_U = 1.0 / w_U
v_R = 1.0 / w_R
v_M = 1.0 / w_M

#######################################################
# functions

def average_collected(t, n, N, c):
    return(N - (N-c)*(((N-n)/N)**t))

#######################################################
# number of cards collected versus t

t_arr = np.arange(501)
P_C_avg = average_collected(t_arr, n_C, N_C, c_C)
P_U_avg = average_collected(t_arr, n_U, N_U, c_U)
P_R_avg = average_collected(t_arr, n_R, N_R, c_R)
P_M_avg = average_collected(t_arr, n_M, N_M, c_M)

P_C_missing = N_C - P_C_avg
P_U_missing = N_U - P_U_avg
P_R_missing = N_R - P_R_avg
P_M_missing = N_M - P_M_avg

P_C_cost = t_arr + (P_C_missing*v_C)
P_U_cost = t_arr + (P_U_missing*v_U)
P_R_cost = t_arr + (P_R_missing*v_R)
P_M_cost = t_arr + (P_M_missing*v_M)

cost_total = t_arr + (P_C_missing*v_C) + (P_U_missing*v_U) + (P_R_missing*v_R) + (P_M_missing*v_M)

ind_min = np.argmin(cost_total)

#######################################################
# plot results

fig = plt.figure(figsize=(6,6))

ax_cost = fig.add_axes([0.05,0.75,0.9,0.30])
ax_collected_packs = fig.add_axes([0.05,0.40,0.9,0.30])
ax_collected_wildcards = fig.add_axes([0.05,0.05,0.9,0.30])

ax_cost.plot(t_arr,cost_total,'k-',linewidth=2)
ax_cost.plot([t_arr[ind_min]],[cost_total[ind_min]],'r.',markersize=10,markeredgewidth=0)

ax_collected_packs.plot(t_arr,P_C_avg/N_C,linestyle='-',color='black',linewidth=1)
ax_collected_packs.plot(t_arr,P_U_avg/N_U,linestyle='-',color='gray',linewidth=1)
ax_collected_packs.plot(t_arr,P_R_avg/N_R,linestyle='-',color='gold',linewidth=1)
ax_collected_packs.plot(t_arr,P_M_avg/N_M,linestyle='-',color='orange',linewidth=1)

ax_collected_wildcards.plot(t_arr,P_C_missing,linestyle='-',color='black',linewidth=1,label='Common')
ax_collected_wildcards.plot(t_arr,P_U_missing,linestyle='-',color='gray',linewidth=1,label='Uncommon')
ax_collected_wildcards.plot(t_arr,P_R_missing,linestyle='-',color='gold',linewidth=1,label='Rare')
ax_collected_wildcards.plot(t_arr,P_M_missing,linestyle='-',color='orange',linewidth=1,label='Mythic')

xmin = 0
xmax = np.max(t_arr)
ax_cost.set_xlim(xmin,xmax)
ax_collected_packs.set_xlim(xmin,xmax)
ax_collected_wildcards.set_xlim(xmin,xmax)

ymin = 0
ymax = np.max(cost_total)
ax_cost.set_ylim(ymin,ymax)
ax_collected_packs.set_ylim(np.min([P_C_avg/N_C,P_U_avg/N_U,P_R_avg/N_R,P_M_avg/N_M]),1.0)
ax_collected_wildcards.set_ylim(0,np.max([P_C_missing,P_U_missing,P_R_missing,P_M_missing]))

ax_cost.set_xticklabels([])
ax_collected_packs.set_xticklabels([])
ax_collected_wildcards.legend(loc='upper right')

ax_cost.grid(linewidth=0.5,linestyle='--',alpha=0.2)
ax_collected_packs.grid(linewidth=0.5,linestyle='--',alpha=0.2)
ax_collected_wildcards.grid(linewidth=0.5,linestyle='--',alpha=0.2)

ax_collected_wildcards.set_xlabel('Number of packs opened')
ax_cost.set_ylabel('Total cost\n(effective number of packs)')
ax_collected_packs.set_ylabel('Fraction of cards collected\nvia opening packs')
ax_collected_wildcards.set_ylabel('Number of wildcards used')

plt.savefig('cost_vs_t.png',dpi=300,bbox_inches='tight')
plt.close()

#######################################################
# print results and strategy

message_str = '\n'
message_str += 'For this set, wildcards have the following equivalent pack values:' + '\n'
message_str += 'Common wildcards are worth approximately '+str(np.round(v_C,2))+' packs each.' + '\n'
message_str += 'Uncommon wildcards are worth approximately '+str(np.round(v_U,2))+' packs each.' + '\n'
message_str += 'Rare wildcards are worth approximately '+str(np.round(v_R,2))+' packs each.' + '\n'
message_str += 'Mythic wildcards are worth approximately '+str(np.round(v_M,2))+' packs each.' + '\n'

message_str += '\n'
message_str += 'You started with:' + '\n'
message_str += str(c_C)+' / '+str(N_C)+ ' Commons' + '\n'
message_str += str(c_U)+' / '+str(N_U)+ ' Uncommons' + '\n'
message_str += str(c_R)+' / '+str(N_R)+ ' Rares' + '\n'
message_str += str(c_M)+' / '+str(N_M)+ ' Mythics' + '\n'

message_str += '\n'
message_str += 'On average, the minimum overall cost will be incurred by opening ' + str(t_arr[ind_min]) + ' more packs.' + '\n'
message_str += 'Doing so is expected to result in:' + '\n'
message_str += str(int(np.round(P_C_avg[ind_min]))) + ' / ' + str(N_C) + ' Commons,' + '\n'
message_str += str(int(np.round(P_U_avg[ind_min]))) + ' / ' + str(N_U) + ' Uncommons,' + '\n'
message_str += str(int(np.round(P_R_avg[ind_min]))) + ' / ' + str(N_R) + ' Rares, and' + '\n'
message_str += str(int(np.round(P_M_avg[ind_min]))) + ' / ' + str(N_M) + ' Mythics' + '\n'
message_str += 'being opened in packs.  '
message_str += 'Wildcards should be used to obtain the remaining cards.' + '\n'

print(message_str)

#######################################################
